import { describe, it, expect } from 'vitest'
import { loadFlows, isMarketingFlow, flowTypes, flowSteps, startSummary, loadFlowVersion } from '../flows.js'

describe('marketing flows', () => {
  it('lists flows, falling back to fewer fields on an older API', async () => {
    const asked = []
    const call = async (path) => {
      const q = decodeURIComponent(path.split('q=')[1])
      asked.push(q)
      if (q.includes('TriggerObjectOrEventLabel')) return { ok: false, error: "INVALID_FIELD: No such column 'TriggerObjectOrEventLabel'" }
      return { ok: true, data: { records: [{ attributes: {}, Id: '300x', Label: 'Welcome', ProcessType: 'SegmentTriggeredFlow' }] } }
    }
    expect(await loadFlows(call, '66.0')).toEqual([{ Id: '300x', Label: 'Welcome', ProcessType: 'SegmentTriggeredFlow' }])
    expect(asked).toHaveLength(2)
  })

  it('guesses marketing flows and counts types', () => {
    expect(isMarketingFlow({ ProcessType: 'SegmentTriggeredFlow' })).toBe(true)
    expect(isMarketingFlow({ ProcessType: 'AutoLaunchedFlow', TriggerType: 'RecordAfterSave' })).toBe(false)
    expect(flowTypes([{ ProcessType: 'Flow' }, { ProcessType: 'Flow' }, {}])).toEqual([{ type: 'Flow', count: 2 }, { type: 'Unknown', count: 1 }])
  })

  it('orders steps from the start and describes them', () => {
    const md = { Metadata: {
      start: { connector: { targetReference: 'Check' }, triggerType: 'Segment', segment: 'Newsletter' },
      decisions: [{ name: 'Check', label: 'Opted in?', rules: [{ name: 'Yes', label: 'Yes', connector: { targetReference: 'Send' } }], defaultConnector: { targetReference: 'Stop' } }],
      actionCalls: [{ name: 'Send', label: 'Send welcome', actionType: 'sendEmailMessage', actionName: 'Welcome_Email' }],
      waits: [{ name: 'Stop', label: 'Wait 2 days', waitEvents: [{ name: 'd2', label: '2 days' }] }],
      assignments: [{ name: 'Orphan', label: 'Unused' }],
    } }
    const { steps, start } = flowSteps(md)
    expect(steps.map((s) => s.label)).toEqual(['Opted in?', 'Send welcome', 'Wait 2 days', 'Unused'])
    expect(steps[1].detail).toBe('sendEmailMessage: Welcome_Email')
    expect(startSummary(start)).toBe('Segment · Newsletter')
    expect(startSummary({ connector: {}, activation: null, dataGraph: null })).toBe('No trigger: runs from a screen, a button or another flow')
    expect(startSummary({ triggerType: 'Activation', activation: 'Spring_Push', dataGraph: 'Customer_DG' })).toBe('Activation · activation Spring_Push · data graph Customer_DG')
  })

  it('reads a version from the Tooling API only for a record ID', async () => {
    const paths = []
    const call = async (p) => { paths.push(p); return { ok: true, data: { Metadata: {} } } }
    await loadFlowVersion(call, '66.0', '301000000000001AAA')
    expect(paths).toEqual(['/services/data/v66.0/tooling/sobjects/Flow/301000000000001AAA'])
    await expect(loadFlowVersion(call, '66.0', '../x')).rejects.toThrow()
  })
})
