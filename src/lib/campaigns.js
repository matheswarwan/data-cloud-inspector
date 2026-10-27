// Campaigns (Marketing Cloud Next, analysis doc 2026-10-27): Campaign records with SOQL,
// member counts by status, and engagement counts from any engagement DMO that has a
// campaign field (matched by name; not yet seen on an org with Marketing Cloud Next).
import { soqlAll } from './personalization.js'
import { lit } from './profile.js'

const FULL = 'SELECT Id, Name, Type, Status, IsActive, StartDate, EndDate, NumberOfContacts, NumberOfLeads, NumberOfResponses, ParentId, Description, LastModifiedDate FROM Campaign ORDER BY LastModifiedDate DESC LIMIT 2000'
const MINIMAL = 'SELECT Id, Name, Type, Status, IsActive, StartDate, EndDate, LastModifiedDate FROM Campaign ORDER BY LastModifiedDate DESC LIMIT 2000'

export async function loadCampaigns(call, version) {
  try { return await soqlAll(call, version, FULL) } catch (e) {
    if (!/INVALID_FIELD|No such column/i.test(e.message)) throw e
    return soqlAll(call, version, MINIMAL)
  }
}

const RECORD_ID = /^[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$/

/** `[{ status, count }]` of the campaign's members. */
export async function memberStatuses(call, version, campaignId) {
  if (!RECORD_ID.test(String(campaignId))) throw new Error('Not a campaign ID.')
  const rows = await soqlAll(call, version, `SELECT Status, COUNT(Id) n FROM CampaignMember WHERE CampaignId = '${campaignId}' GROUP BY Status`)
  return rows.map((r) => ({ status: r.Status || '(none)', count: Number(r.n || r.expr0 || 0) })).sort((a, b) => b.count - a.count)
}

const CAMPAIGN_FIELD = /campaign/i
const ACTION_FIELD = /EngagementChannelAction|EngagementType|EngagementAction|ActionName|EventType/i

/** Engagement DMOs with a campaign field: `[{ object, campaignField, actionField }]`. */
export function campaignEngagementObjects(catalog) {
  return (catalog || []).filter((o) => o.category === 'Engagement' || /engagement/i.test(o.name)).flatMap((o) => {
    const campaignField = (o.fields || []).find((f) => CAMPAIGN_FIELD.test(f.name) && /Id__c$|Id$/i.test(f.name))?.name
    if (!campaignField) return []
    return [{ object: o.name, label: o.label || o.name, campaignField, actionField: (o.fields || []).find((f) => ACTION_FIELD.test(f.name))?.name || '' }]
  })
}

export function campaignEngagementSql(e, campaignId) {
  return e.actionField
    ? `SELECT ${e.actionField} AS action, COUNT(*) AS n FROM ${e.object} WHERE ${e.campaignField} = ${lit(campaignId)} GROUP BY ${e.actionField}`
    : `SELECT COUNT(*) AS n FROM ${e.object} WHERE ${e.campaignField} = ${lit(campaignId)}`
}

