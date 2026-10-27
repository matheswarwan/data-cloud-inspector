// Marketing Cloud Next on a person's profile (analysis doc, 2026-10-27): message history
// by channel and action from the engagement DMOs, and consent, which hangs off contact
// points (an email address, a phone number) rather than the person. Object and field
// names are matched loosely: they come from Trailhead and practitioner write-ups and are
// not yet seen on an org with Marketing Cloud Next.
import { loadRelated } from './profile.js'

const CHANNELS = [
  [/whatsapp/i, 'WhatsApp'],
  [/sms|text/i, 'SMS'],
  [/push|mobileapp|inapp/i, 'Mobile app'],
  [/email/i, 'Email'],
  [/website|web/i, 'Website'],
  [/flowrun|flow/i, 'Flow run'],
  [/message/i, 'Messaging'],
]

/** The channel an engagement object records, from its name ("Email", "SMS", ...). */
export function channelOf(objectName) {
  const n = String(objectName || '').replace(/^ssot__|__dlm$/g, '')
  return CHANNELS.find(([re]) => re.test(n))?.[1] || n
}

const ACTION_FIELD = /EngagementChannelAction|EngagementType|EngagementAction|ActionName|EventType|ActivityType|InteractionType/i

/** What happened (Sent, Open, Click, Bounce, Unsubscribe...), from the row's action field. */
export function actionOf(row) {
  const hit = Object.entries(row || {}).find(([k, v]) => ACTION_FIELD.test(k) && v != null && v !== '')
  return hit ? String(hit[1]) : ''
}

/** `[{ channel, count, actions: [{ action, count }] }]`, most events first. */
export function engagementSummary(events) {
  const byChannel = new Map()
  for (const ev of events) {
    const ch = ev.channel || channelOf(ev.object)
    const c = byChannel.get(ch) || { channel: ch, count: 0, actions: new Map() }
    c.count++
    const a = ev.action ?? actionOf(ev.row)
    if (a) c.actions.set(a, (c.actions.get(a) || 0) + 1)
    byChannel.set(ch, c)
  }
  return [...byChannel.values()]
    .map((c) => ({ ...c, actions: [...c.actions].map(([action, count]) => ({ action, count })).sort((x, y) => y.count - x.count) }))
    .sort((a, b) => b.count - a.count)
}

export const isConsentObject = (name) => /consent|communicationsubscription|privacy/i.test(String(name || ''))

const STATUS_FIELD = /ConsentStatus|PrivacyConsentStatus|OptIn|SubscriptionStatus|Status/i
const WHEN_FIELD = /EffectiveFrom|CaptureDate|ConsentCaptured|LastModified|Created/i
const NAME_FIELD = /CommunicationSubscription.*Name|SubscriptionName|DataUsePurpose|Purpose|Name/i
const CHANNEL_FIELD = /EngagementChannelType|ChannelType|Channel/i

/** Plain facts of a consent row: { status, subscription, channel, when }. */
export function consentFacts(row) {
  const pick = (re, skip = /Id__c$/) => {
    const hit = Object.entries(row || {}).find(([k, v]) => re.test(k) && !skip.test(k) && v != null && v !== '')
    return hit ? String(hit[1]) : ''
  }
  return { status: pick(STATUS_FIELD), subscription: pick(NAME_FIELD), channel: pick(CHANNEL_FIELD), when: pick(WHEN_FIELD, /^$/) }
}

/**
 * Consent rows for the profile's contact points: each contact point entry (from
 * loadRelated on the Individual) with rows, then the objects related to it whose name
 * says consent or subscription. Same entry shape as loadRelated.
 */
export async function loadConsent(q, contactPointEntries, catalog) {
  const out = []
  const seen = new Set()
  for (const cp of contactPointEntries.filter((e) => e.rows?.length)) {
    const entries = await loadRelated(q, cp.object, cp.rows, catalog, { skip: (r) => !isConsentObject(r.object) })
    for (const e of entries) {
      const key = `${e.object}|${e.sql}`
      if (seen.has(key) || (!e.rows.length && !e.error)) continue
      seen.add(key)
      out.push({ ...e, via: cp.object })
    }
  }
  return out
}
