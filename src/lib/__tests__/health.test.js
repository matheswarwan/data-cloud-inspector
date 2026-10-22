import { streamHealth, rulesetHealth, insightHealth, segmentHealth, activationHealth, intervalHours, sortItems, countLevels, healthMarkdown, loadHealth } from '../health.js'

describe('health rules', () => {
  it('streams', () => {
    expect(streamHealth({ name: 'a', label: 'A', status: 'ACTIVE', lastRunStatus: 'SUCCESS', totalRecords: 150, connector: 'SalesforceDotCom', sourceObject: 'Contact' })).toMatchObject({ level: 'ok', details: 'SalesforceDotCom: Contact, 150 records' })
    expect(streamHealth({ name: 'a', label: 'A', status: 'ACTIVE', lastRunStatus: 'NONE' })).toMatchObject({ level: 'warn', reason: 'Has never run' })
    expect(streamHealth({ name: 'a', label: 'A', status: 'ACTIVE', lastRunStatus: 'FAILURE' }).level).toBe('fail')
    expect(streamHealth({ name: 'a', label: 'A', status: 'ACTIVE', lastRunStatus: 'IN_PROGRESS' }).level).toBe('running')
    expect(streamHealth({ name: 'a', label: 'A', status: 'INACTIVE', lastRunStatus: 'SUCCESS' }).level).toBe('idle')
  })
  it('rulesets, including one that ran with no source profiles', () => {
    const r = { id: 'b2c', label: 'B2C', status: 'PUBLISHED', recordId: '1ir' }
    expect(rulesetHealth(r, { lastJobStatus: 'SUCCESS', sourceProfiles: 0, totalUnifiedProfiles: 0, consolidationRate: 0 })).toMatchObject({ level: 'warn' })
    const ok = rulesetHealth(r, { lastJobStatus: 'SUCCESS', sourceProfiles: 200, totalUnifiedProfiles: 150, consolidationRate: 0.25 })
    expect(ok.level).toBe('ok')
    expect(ok.details).toBe('200 source profiles into 150 unified, consolidation rate 25%')
    expect(rulesetHealth(r, { lastJobStatus: 'SUCCESS', sourceProfiles: 4, consolidationRate: 25 }).details).toContain('25%')
    expect(rulesetHealth({ ...r, status: 'DRAFT' }, {}).level).toBe('idle')
  })
  it('calculated insights with an error code', () => {
    expect(insightHealth({ apiName: 'x__cio', calculatedInsightStatus: 'ACTIVE', lastRunStatus: 'FAILURE', lastRunStatusErrorCode: 'QUERY_TIMEOUT' })).toMatchObject({ level: 'fail', reason: 'Last run: failure (QUERY_TIMEOUT)' })
    expect(insightHealth({ apiName: 'x__cio', isEnabled: false }).level).toBe('idle')
  })
  it('segments: never published, failed, overdue', () => {
    const now = Date.parse('2026-10-23T12:00:00Z')
    const s = { apiName: 'S', label: 'S', status: 'ACTIVE', lastCount: 10 }
    expect(segmentHealth({ ...s, publishStatus: '' }, now).reason).toBe('Has never been published')
    expect(segmentHealth({ ...s, publishStatus: 'FAILED', lastPublished: '2026-10-23T11:00:00Z' }, now).level).toBe('fail')
    expect(segmentHealth({ ...s, publishStatus: 'SUCCESS', lastPublished: '2026-10-22T00:00:00Z', publishInterval: 'TWELVE' }, now)).toMatchObject({ level: 'warn' })
    expect(segmentHealth({ ...s, publishStatus: 'SUCCESS', lastPublished: '2026-10-22T00:00:00Z', publishInterval: 'NO_REFRESH' }, now).level).toBe('ok')
    expect(intervalHours('TWENTY_FOUR')).toBe(24)
    expect(intervalHours('NO_REFRESH')).toBeNull()
  })
  it('activations', () => {
    expect(activationHealth({ name: 'A', status: 'ACTIVE', lastPublishStatus: 'SUCCESS', segmentApiName: 'S', activationTargetName: 'T' })).toMatchObject({ level: 'ok', details: 'S to T' })
  })
})

describe('report', () => {
  it('sorts problems first, counts and writes Markdown', () => {
    const items = sortItems([{ level: 'ok', label: 'b' }, { level: 'fail', label: 'z' }, { level: 'warn', label: 'a' }])
    expect(items.map((i) => i.level)).toEqual(['fail', 'warn', 'ok'])
    expect(countLevels(items)).toEqual({ fail: 1, warn: 1, running: 0, idle: 0, ok: 1 })
    const md = healthMarkdown([{ title: 'Segments', items: [{ level: 'fail', label: 'S', reason: 'Last publish: failed', lastRun: '', details: 'a|b' }], error: '' }, { title: 'Activations', items: [], error: 'boom' }], { host: 'acme', at: new Date('2026-10-23T00:00:00Z') })
    expect(md).toContain('# Data Cloud health: acme')
    expect(md).toContain('1 failed, 0 need a look')
    expect(md).toContain('| Failed | S | Last publish: failed |  | a\\|b |')
    expect(md).toContain('Could not load: boom')
  })
  it('keeps the other sections when one fails', async () => {
    const call = async (path) => (path.includes('activations') ? { ok: false, error: 'nope' } : { ok: true, data: {} })
    const sections = await loadHealth(call, '68.0')
    expect(sections.map((s) => s.title)).toEqual(['Data streams', 'Identity resolution', 'Calculated insights', 'Segments', 'Activations', 'Personalization recommenders'])
    expect(sections[4].error).toBe('nope')
    expect(sections[0].error).toBe('')
  })
})
