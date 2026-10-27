import { describe, it, expect } from 'vitest'
import { addressesFrom, consentQueries, consentRows, loadCrmConsent } from '../crmConsent.js'

describe('consent in Salesforce records', () => {
  it('takes addresses from contact point rows', () => {
    expect(addressesFrom([{ rows: [{ ssot__EmailAddress__c: 'pat@example.com', ssot__Id__c: 'x' }] }, { rows: [{ ssot__TelephoneNumber__c: '(415) 555-0100' }] }]))
      .toEqual({ emails: ['pat@example.com'], phones: ['(415) 555-0100'] })
  })

  it('writes the SOQL with escaped values, and nothing when there is nothing to look up', () => {
    const q = consentQueries({ emails: ["o'neil@example.com"], contactPointIds: ['9Uz000000000001AAA'] })
    expect(q.cpEmails).toBe("SELECT Id, EmailAddress FROM ContactPointEmail WHERE EmailAddress IN ('o\\'neil@example.com')")
    expect(q.subscriptions).toContain("WHERE ContactPointValue IN ('o\\'neil@example.com') OR ContactPointId IN ('9Uz000000000001AAA')")
    expect(q.purposes).toContain("FROM ContactPointConsent WHERE ContactPointId IN ('9Uz000000000001AAA')")
    expect(consentQueries({})).toEqual({ cpEmails: '', cpPhones: '', subscriptions: '', purposes: '' })
  })

  it('reads subscription and data use consent', async () => {
    const call = async (path) => {
      const q = decodeURIComponent(path.split('q=')[1])
      if (q.startsWith('SELECT Id, EmailAddress')) return { ok: true, data: { records: [{ Id: 'CPE1', EmailAddress: 'pat@example.com' }] } }
      if (q.includes('FROM CommSubscriptionConsent')) return { ok: true, data: { records: [{ Id: 'S1', PrivacyConsentStatus: 'OptOut', ContactPointValue: 'pat@example.com', ConsentCapturedDateTime: '2026-10-01T00:00:00Z', CommSubscriptionChannelType: { Name: 'Newsletter Email', CommunicationSubscription: { Name: 'Newsletter' } }, EngagementChannelType: { Name: 'Email' } }] } }
      if (q.includes('FROM ContactPointConsent')) return { ok: true, data: { records: [{ Id: 'P1', PrivacyConsentStatus: 'OptIn', ContactPointId: 'CPE1', DataUsePurpose: { Name: 'Marketing' }, CaptureDate: '2026-09-01T00:00:00Z' }] } }
      return { ok: false, error: 'unexpected' }
    }
    const r = await loadCrmConsent(call, '68.0', { emails: ['pat@example.com'] })
    expect(r.errors).toEqual([])
    expect(r.rows).toEqual([
      { kind: 'Subscription', id: 'S1', status: 'OptOut', subscription: 'Newsletter', channel: 'Email', purpose: '', value: 'pat@example.com', when: '2026-10-01T00:00:00Z', source: '' },
      { kind: 'Data use', id: 'P1', status: 'OptIn', subscription: '', channel: '', purpose: 'Marketing', value: 'pat@example.com', when: '2026-09-01T00:00:00Z', source: '' },
    ])
  })
})
