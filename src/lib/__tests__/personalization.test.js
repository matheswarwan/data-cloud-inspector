import { loadSetup, pointTree, experimentTree, nameOf, loadActivity, ACTIVITY_SQL, SETUP_QUERIES } from '../personalization.js'
import { recommenderHealth } from '../health.js'

const SETUP = {
  points: [{ Id: '0Px000000000001AAA', Name: 'Home hero', PersonalizationSchemaId: '0Sc000000000001AAA', AbnExperimentId: null }],
  decisions: [
    { Id: '0Pd000000000002AAA', Name: 'Fallback', PersonalizationPointId: '0Px000000000001AAA', Priority: 2, PersonalizerId: '0Pr000000000001AAA' },
    { Id: '0Pd000000000001AAA', Name: 'VIP', PersonalizationPointId: '0Px000000000001', Priority: 1, ActiveAbnExperimentId: '0Ab000000000001AAA' },
  ],
  recommenders: [{ Id: '0Pr000000000001AAA', Name: 'Top sellers' }],
  experiments: [{ Id: '0Ab000000000001AAA', Name: 'Hero test' }],
  experimentDecisions: [{ AbnExperimentId: '0Ab000000000001AAA', PersonalizationDecisionId: '0Pd000000000001AAA', ExperimentStatus: 'Running' }],
  schemas: [{ Id: '0Sc000000000001AAA', Name: 'Hero Banner' }],
  objectives: [],
}

describe('personalization setup', () => {
  it('nests decisions under points by priority, with names (15 or 18 character IDs)', () => {
    const [p] = pointTree(SETUP)
    expect(p.schemaName).toBe('Hero Banner')
    expect(p.decisions.map((d) => [d.Name, d.personalizerName, d.experimentName])).toEqual([['VIP', '', 'Hero test'], ['Fallback', 'Top sellers', '']])
  })
  it('lists the decisions of each experiment', () => {
    expect(experimentTree(SETUP)[0].decisions).toEqual([{ AbnExperimentId: '0Ab000000000001AAA', PersonalizationDecisionId: '0Pd000000000001AAA', ExperimentStatus: 'Running', decisionName: 'VIP' }])
  })
  it('names log IDs', () => {
    expect(nameOf(SETUP, '0Px000000000001')).toBe('Home hero')
    expect(nameOf(SETUP, 'unknown')).toBe('unknown')
  })
  it('loads every query and keeps going when one fails', async () => {
    const call = async (path) => (path.includes('AbnExperiment+') || decodeURIComponent(path).includes('FROM AbnExperiment ') ? { ok: false, error: 'INVALID_TYPE' } : { ok: true, data: { records: [{ attributes: {}, Id: 'x' }] } })
    const s = await loadSetup(call, '68.0')
    expect(Object.keys(SETUP_QUERIES).every((k) => Array.isArray(s[k]))).toBe(true)
    expect(s.points).toEqual([{ Id: 'x' }])
    expect(s.errors.experiments).toBe('INVALID_TYPE')
  })
})

describe('personalization activity', () => {
  it('runs the four queries for the period', async () => {
    const seen = []
    const q = async (sql) => { seen.push(sql); return { columns: [{ name: 'n' }], rows: [[1]] } }
    const a = await loadActivity(q, { days: 7 })
    expect(seen).toHaveLength(4)
    expect(seen[0]).toContain("INTERVAL '7' DAY")
    expect(a.daily).toEqual([{ n: 1 }])
    expect(ACTIVITY_SQL.recent()).toContain('ORDER BY ssot__RequestDateTime__c DESC LIMIT 50')
  })
})

describe('recommender health', () => {
  it('flags failed and never-refreshed recommenders', () => {
    expect(recommenderHealth({ Id: 'r', Name: 'R', Status: 'Active', LatestRefreshedStatus: 'Failed' }).level).toBe('fail')
    expect(recommenderHealth({ Id: 'r', Name: 'R', Status: 'Active' }).level).toBe('warn')
    expect(recommenderHealth({ Id: 'r', Name: 'R', Status: 'Inactive' }).level).toBe('idle')
    expect(recommenderHealth({ Id: 'r', Name: 'R', Status: 'Active', LatestRefreshedStatus: 'Success' }).level).toBe('ok')
  })
})

import { personalizationStatus } from '../personalization.js'

describe('personalizationStatus (feedback #114)', () => {
  const notSupported = "INVALID_TYPE: Description, DataSpaceId FROM PersonalizationRecommender ORDER ^ ERROR at Row:1:Column:231 sObject type 'PersonalizationRecommender' is not supported."
  const noTable = 'INVALID_ARGUMENT: table "ssot__PersonalizationLog__dlm" does not exist'
  it('recognises an org without Personalization', () => {
    const s = personalizationStatus({ points: [], errors: { points: notSupported, recommenders: notSupported } }, { errors: { daily: noTable, recent: noTable } })
    expect(s.setupMissing).toBe(true)
    expect(s.logMissing).toBe(true)
    expect(s.details.map((d) => d.area)).toEqual(['points', 'recommenders', 'log: daily', 'log: recent'])
  })
  it('keeps other errors as errors', () => {
    const s = personalizationStatus({ points: [], errors: { points: 'REQUEST_LIMIT_EXCEEDED' } }, { errors: { daily: 'timeout' } })
    expect(s).toEqual({ setupMissing: false, logMissing: false, details: [] })
  })
  it('is not missing when some setup records came back', () => {
    expect(personalizationStatus({ schemas: [{ Id: 'x' }], errors: { points: notSupported } }, null).setupMissing).toBe(false)
  })
})
