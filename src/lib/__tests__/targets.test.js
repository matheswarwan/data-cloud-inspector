import { describe, it, expect } from 'vitest'
import { normalizeTarget, targetHealth, inDataSpace, activationsFor, loadTargets, targetMarkdown } from '../targets.js'

const rec = { Id: '85UOL0000006zdV2AQ', MasterLabel: 'SFMC Engagement', TargetStatus: 'ACTIVE', RunStatus: 'PUBLISHING', ConnectionType: 'SalesforceMarketingCloud', TargetType: 'DE', PlatformName: 'Salesforce Marketing Cloud', OutputFormat: 'JSON', DataSpaceId: '0vhau0000001HQDAA2', IsCommunicationCappingEnabled: false, IsRemote: false, AudienceLatestDmoName: 'AAL_SFMC_85UOL0000006zdV2AQ' }

describe('Data targets (feedback #1064)', () => {
  it('reads a record in plain names and gives it a status', () => {
    const t = normalizeTarget(rec)
    expect(t).toMatchObject({ label: 'SFMC Engagement', platform: 'Salesforce Marketing Cloud', targetType: 'DE', latestDmo: 'AAL_SFMC_85UOL0000006zdV2AQ' })
    expect(targetHealth(t).level).toBe('running')
    expect(targetHealth(normalizeTarget({ ...rec, LastPublishStatusErrorMessage: 'Auth failed' }))).toEqual({ level: 'fail', reason: 'Auth failed' })
    expect(targetHealth(normalizeTarget({ ...rec, TargetStatus: 'INACTIVE' })).level).toBe('idle')
  })
  it('keeps the data space and finds the activations by ID or name', () => {
    const t = normalizeTarget(rec)
    expect(inDataSpace([t, normalizeTarget({ ...rec, Id: 'x', DataSpaceId: '0vhOTHER0000001' })], '0vhau0000001HQD')).toHaveLength(1)
    const acts = [{ id: 'a1', targetId: '85UOL0000006zdV' }, { id: 'a2', target: 'SFMC Engagement' }, { id: 'a3', targetId: 'other' }]
    expect(activationsFor(t, acts).map((a) => a.id)).toEqual(['a1', 'a2'])
  })
  it('falls back to named fields when FIELDS(ALL) is refused', async () => {
    const calls = []
    const call = async (p) => { calls.push(decodeURIComponent(p)); return calls.length === 1 ? { ok: false, status: 400, error: 'MALFORMED_QUERY' } : { ok: true, data: { records: [rec] } } }
    const list = await loadTargets(call, '66.0')
    expect(list).toHaveLength(1)
    expect(calls[0]).toMatch(/FIELDS\(ALL\)/)
    expect(calls[1]).toMatch(/SELECT Id, MasterLabel/)
  })
  it('writes Markdown', () => {
    expect(targetMarkdown(normalizeTarget(rec), { activations: [{ name: 'A', segment: 'S', lastPublishStatus: 'SUCCESS' }] })).toMatch(/# SFMC Engagement[\s\S]*\| Platform \| Salesforce Marketing Cloud \|[\s\S]*- A \(S\), last publish success/)
  })
})
