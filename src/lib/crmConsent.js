// Consent kept in Salesforce records (Marketing Cloud Next; fields from the describe on
// the user's org, API v68.0, 2026-10-27): CommSubscriptionConsent (a subscription, with
// the address itself in ContactPointValue) and ContactPointConsent (a data use purpose),
// both linked to ContactPointEmail / ContactPointPhone records. Looked up by the person's
// email addresses and phone numbers from their Data Cloud contact points. Read only.
import { soqlAll } from './personalization.js'

const MAX = 50
const soqlString = (v) => `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
const inList = (values) => `(${values.slice(0, MAX).map(soqlString).join(', ')})`

/** Email addresses and phone numbers in Data Cloud contact point rows. */
export function addressesFrom(entries) {
  const emails = new Set()
  const phones = new Set()
  for (const e of entries || []) {
    for (const row of e.rows || []) {
      for (const [k, v] of Object.entries(row)) {
        if (v == null || v === '') continue
        if (/EmailAddress/i.test(k)) emails.add(String(v).trim())
        else if (/TelephoneNumber|FormattedE164PhoneNumber|PhoneNumber$/i.test(k)) phones.add(String(v).trim())
      }
    }
  }
  return { emails: [...emails], phones: [...phones] }
}

export const SUBSCRIPTION_FIELDS = 'Id, Name, PrivacyConsentStatus, EffectiveFromDate, ConsentCapturedDateTime, ConsentCapturedSource, ContactPointValue, ContactPointId, CommSubscriptionChannelType.Name, CommSubscriptionChannelType.CommunicationSubscription.Name, EngagementChannelType.Name, DataUsePurpose.Name'
export const PURPOSE_FIELDS = 'Id, Name, PrivacyConsentStatus, EffectiveFrom, EffectiveTo, CaptureDate, CaptureSource, CaptureContactPointType, ContactPointId, DataUsePurpose.Name'

/** The SOQL for the lookups; empty strings where there is nothing to look up. */
export function consentQueries({ emails = [], phones = [], contactPointIds = [] }) {
  const cpEmails = emails.length ? `SELECT Id, EmailAddress FROM ContactPointEmail WHERE EmailAddress IN ${inList(emails)}` : ''
  const cpPhones = phones.length ? `SELECT Id, TelephoneNumber FROM ContactPointPhone WHERE TelephoneNumber IN ${inList(phones)}` : ''
  const values = [...emails, ...phones]
  const where = [values.length && `ContactPointValue IN ${inList(values)}`, contactPointIds.length && `ContactPointId IN ${inList(contactPointIds)}`].filter(Boolean).join(' OR ')
  return {
    cpEmails, cpPhones,
    subscriptions: where ? `SELECT ${SUBSCRIPTION_FIELDS} FROM CommSubscriptionConsent WHERE ${where} ORDER BY ConsentCapturedDateTime DESC LIMIT 200` : '',
    purposes: contactPointIds.length ? `SELECT ${PURPOSE_FIELDS} FROM ContactPointConsent WHERE ContactPointId IN ${inList(contactPointIds)} ORDER BY CaptureDate DESC LIMIT 200` : '',
  }
}

/** One row per consent: { kind, status, subscription, channel, purpose, value, when, source, id }. */
export function consentRows(subscriptions, purposes, addressOf = new Map()) {
  return [
    ...subscriptions.map((r) => ({
      kind: 'Subscription', id: r.Id, status: r.PrivacyConsentStatus || '',
      subscription: r.CommSubscriptionChannelType?.CommunicationSubscription?.Name || r.CommSubscriptionChannelType?.Name || '',
      channel: r.EngagementChannelType?.Name || '', purpose: r.DataUsePurpose?.Name || '',
      value: r.ContactPointValue || addressOf.get(r.ContactPointId) || '', when: r.ConsentCapturedDateTime || r.EffectiveFromDate || '', source: r.ConsentCapturedSource || '',
    })),
    ...purposes.map((r) => ({
      kind: 'Data use', id: r.Id, status: r.PrivacyConsentStatus || '', subscription: '', channel: r.CaptureContactPointType || '',
      purpose: r.DataUsePurpose?.Name || '', value: addressOf.get(r.ContactPointId) || '', when: r.CaptureDate || r.EffectiveFrom || '', source: r.CaptureSource || '',
    })),
  ]
}

/**
 * `{ rows, errors, queries }` for the addresses. An org without these objects answers with
 * an error per query, which is kept, not thrown.
 */
export async function loadCrmConsent(call, version, { emails = [], phones = [] }) {
  const errors = []
  const safe = (q) => (q ? soqlAll(call, version, q).catch((e) => { errors.push(e.message); return [] }) : Promise.resolve([]))
  const first = consentQueries({ emails, phones })
  const [cpE, cpP] = await Promise.all([safe(first.cpEmails), safe(first.cpPhones)])
  const addressOf = new Map([...cpE.map((r) => [r.Id, r.EmailAddress]), ...cpP.map((r) => [r.Id, r.TelephoneNumber])])
  const q = consentQueries({ emails, phones, contactPointIds: [...addressOf.keys()] })
  const [subs, purposes] = await Promise.all([safe(q.subscriptions), safe(q.purposes)])
  return { rows: consentRows(subs, purposes, addressOf), errors, queries: [q.subscriptions, q.purposes].filter(Boolean) }
}
