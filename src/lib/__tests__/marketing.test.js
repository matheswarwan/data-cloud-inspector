import { describe, it, expect } from 'vitest'
import { channelOf, actionOf, engagementSummary, isConsentObject, consentFacts, loadConsent } from '../marketing.js'

describe('Marketing Cloud Next on profiles', () => {
  it('names the channel and action of engagement rows', () => {
    expect(channelOf('ssot__EmailEngagement__dlm')).toBe('Email')
    expect(channelOf('ssot__MessageEngagement__dlm')).toBe('Messaging')
    expect(channelOf('SMS_Engagement__dlm')).toBe('SMS')
    expect(channelOf('ssot__WebsiteEngagement__dlm')).toBe('Website')
    expect(channelOf('ssot__FlowRun__dlm')).toBe('Flow run')
    expect(actionOf({ ssot__Id__c: '1', ssot__EngagementChannelActionId__c: 'Open' })).toBe('Open')
    expect(actionOf({ x: 1 })).toBe('')
  })

  it('counts events per channel and action', () => {
    const ev = (object, a) => ({ object, row: { ssot__EngagementChannelActionId__c: a } })
    const s = engagementSummary([ev('ssot__EmailEngagement__dlm', 'Send'), ev('ssot__EmailEngagement__dlm', 'Open'), ev('ssot__EmailEngagement__dlm', 'Open'), ev('ssot__WebsiteEngagement__dlm', 'Visit')])
    expect(s).toEqual([
      { channel: 'Email', count: 3, actions: [{ action: 'Open', count: 2 }, { action: 'Send', count: 1 }] },
      { channel: 'Website', count: 1, actions: [{ action: 'Visit', count: 1 }] },
    ])
  })

  it('reads consent facts and finds consent through contact points', async () => {
    expect(isConsentObject('ssot__CommunicationSubscriptionConsent__dlm')).toBe(true)
    expect(isConsentObject('ssot__ContactPointEmail__dlm')).toBe(false)
    expect(consentFacts({ ssot__ConsentStatusId__c: 'x', ssot__ConsentStatus__c: 'OptOut', ssot__CommunicationSubscriptionName__c: 'Newsletter', ssot__EffectiveFromDate__c: '2026-10-01' }))
      .toEqual({ status: 'OptOut', subscription: 'Newsletter', channel: '', when: '2026-10-01' })
    const catalog = [
      { name: 'ssot__ContactPointEmail__dlm', relationships: [] },
      { name: 'ssot__CommunicationSubscriptionConsent__dlm', relationships: [{ from: 'ssot__CommunicationSubscriptionConsent__dlm', fromField: 'ssot__ContactPointId__c', to: 'ssot__ContactPointEmail__dlm', toField: 'ssot__Id__c' }] },
      { name: 'ssot__EmailEngagement__dlm', relationships: [{ from: 'ssot__EmailEngagement__dlm', fromField: 'ssot__ContactPointId__c', to: 'ssot__ContactPointEmail__dlm', toField: 'ssot__Id__c' }] },
    ]
    const asked = []
    const q = async (sql) => { asked.push(sql); return { columns: [{ name: 'ssot__ConsentStatus__c' }], rows: [['OptOut']] } }
    const out = await loadConsent(q, [{ object: 'ssot__ContactPointEmail__dlm', rows: [{ ssot__Id__c: 'cp1' }] }], catalog)
    expect(asked).toEqual(["SELECT * FROM ssot__CommunicationSubscriptionConsent__dlm WHERE ssot__ContactPointId__c IN ('cp1') LIMIT 101"])
    expect(out.map((e) => [e.object, e.via, e.rows.length])).toEqual([['ssot__CommunicationSubscriptionConsent__dlm', 'ssot__ContactPointEmail__dlm', 1]])
  })
})
