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

describe('one setup record (feedback #1009)', () => {
  it('reads every field of one record with SOQL, and refuses odd input', async () => {
    const { recordSql, loadRecord } = await import('../personalization.js')
    expect(recordSql('PersonalizationDecision', '9pbjV0000000Hs5QAE')).toBe("SELECT FIELDS(ALL) FROM PersonalizationDecision WHERE Id = '9pbjV0000000Hs5QAE' LIMIT 1")
    expect(() => recordSql('PersonalizationDecision', "x' OR Id != '")).toThrow()
    expect(() => recordSql('Bad Type', '9pbjV0000000Hs5QAE')).toThrow()
    const paths = []
    const call = async (path) => { paths.push(path); return { ok: true, data: { records: [{ attributes: { type: 'PersonalizationDecision' }, Id: '9pbjV0000000Hs5QAE', Name: 'Home Hero All' }] } } }
    expect(await loadRecord(call, '66.0', 'PersonalizationDecision', '9pbjV0000000Hs5QAE')).toEqual({ Id: '9pbjV0000000Hs5QAE', Name: 'Home Hero All' })
    expect(decodeURIComponent(paths[0])).toContain('FIELDS(ALL) FROM PersonalizationDecision')
    await expect(loadRecord(async () => ({ ok: true, data: { records: [] } }), '66.0', 'PersonalizationPoint', '9ppjV0000000GsnQAE')).rejects.toThrow(/No PersonalizationPoint record/)
  })

  it('lists filled fields first and names the point a decision belongs to', async () => {
    const { recordRows } = await import('../personalization.js')
    const setup = { points: [{ Id: '9ppjV0000000GsnQAE', Name: 'Home Hero Batch' }], decisions: [], recommenders: [] }
    const rows = recordRows(setup, { Id: '9pbjV0000000Hs5QAE', Name: 'Home Hero All', PersonalizerId: null, PersonalizationPointId: '9ppjV0000000GsnQAE', State: 'Live', Priority: 1 })
    expect(rows.map((r) => r.field)).toEqual(['Id', 'Name', 'PersonalizationPointId', 'State', 'Priority', 'PersonalizerId'])
    expect(rows.find((r) => r.field === 'PersonalizationPointId').name).toBe('Home Hero Batch')
    expect(rows.find((r) => r.field === 'Priority').value).toBe('1')
  })
})

describe('IDs in the record panel (feedback #1018)', () => {
  it('opens setup records in the panel and other record IDs in Salesforce', async () => {
    const { recordRows, refOf } = await import('../personalization.js')
    const setup = { points: [{ Id: '9ppjV0000000GsnQAE', Name: 'Home Hero Batch' }], decisions: [], recommenders: [] }
    expect(refOf(setup, '9ppjV0000000Gsn').type).toBe('PersonalizationPoint')
    const rows = recordRows(setup, { Id: '9pbjV0000000Hs5QAE', PersonalizationPointId: '9ppjV0000000GsnQAE', DataSpaceId: '0vhjV000000B3gvQAC', State: 'Live', DeveloperName: 'Home_Hero_All' })
    const by = Object.fromEntries(rows.map((r) => [r.field, r]))
    expect(by.PersonalizationPointId).toMatchObject({ name: 'Home Hero Batch', link: false })
    expect(by.PersonalizationPointId.ref.type).toBe('PersonalizationPoint')
    expect(by.DataSpaceId).toMatchObject({ ref: null, link: true })
    expect(by.Id.link).toBe(false)
    expect(by.State.link).toBe(false)
  })
})
