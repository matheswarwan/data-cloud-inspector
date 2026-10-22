// The orgs with a live session, and the session for one org. Cookies are read fresh
// on every call because Salesforce rotates them.

import { getCookie, getAllCookies } from './chromeAsync.js'
import { groupSessions, orgIdFromSid, toApiHost } from './orgs.js'

const DOMAINS = ['salesforce.com', 'cloudforce.com']

async function allSidCookies() {
  const lists = await Promise.all(DOMAINS.map((domain) => getAllCookies({ name: 'sid', domain, secure: true })))
  return lists.flat()
}

/** `[{ orgId, host }]` for every org the browser has an API session for. */
export async function listOrgs() {
  return groupSessions(await allSidCookies())
}

/** The org of a Salesforce tab, or null. */
export async function orgForUrl(url) {
  let parsed
  try { parsed = new URL(url) } catch { return null }
  const cookie = await getCookie({ url: parsed.origin, name: 'sid' })
  const orgId = orgIdFromSid(cookie?.value)
  if (!orgId) return null
  const orgs = await listOrgs()
  return orgs.find((o) => o.orgId === orgId) || { orgId, host: toApiHost(parsed.hostname) }
}

/** `{ host, sid }` for an org, or null when there is no session (logged out). */
export async function sessionFor(orgId) {
  const cookies = await allSidCookies()
  const org = groupSessions(cookies).find((o) => o.orgId === orgId)
  if (!org) return null
  const cookie = cookies.find((c) => c.domain.replace(/^\./, '') === org.host && orgIdFromSid(c.value) === orgId)
  return cookie ? { host: org.host, sid: cookie.value } : null
}
