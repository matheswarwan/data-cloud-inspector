// The orgs with a live session, and the session for one org. Cookies are read fresh
// on every call because Salesforce rotates them. With the administrator policy
// authMode 'oauth-only' no cookie is read: only OAuth logins count. allowedOrgDomains
// hides every other org.

import { getCookie, getAllCookies } from './chromeAsync.js'
import { groupSessions, orgIdFromSid, toApiHost, isApiHost } from './orgs.js'
import { oauthSession, oauthOrgs } from './oauth.js'
import { readManagedPolicy, hostAllowed } from '../lib/policy.js'

// cloudforce.com is a host permission since feedback #1045 (it was optional before).
const DOMAINS = ['salesforce.com', 'cloudforce.com']

async function allSidCookies() {
  const lists = await Promise.all(DOMAINS.map((domain) => getAllCookies({ name: 'sid', domain, secure: true })))
  return lists.flat()
}

/** `[{ orgId, host, oauth? }]` for every org the extension may call. */
export async function listOrgs(deps = {}) {
  const policy = await (deps.policy || readManagedPolicy)()
  const viaOAuth = await (deps.oauthOrgs || oauthOrgs)()
  const viaCookie = policy.authMode === 'oauth-only' ? [] : groupSessions(await (deps.cookies || allSidCookies)())
  const byOrg = new Map(viaCookie.map((o) => [o.orgId, o]))
  for (const o of viaOAuth) byOrg.set(o.orgId, { ...byOrg.get(o.orgId), ...o })
  return [...byOrg.values()].filter((o) => hostAllowed(o.host, policy.allowedOrgDomains)).sort((a, b) => a.host.localeCompare(b.host))
}

/**
 * The org of a Salesforce tab, or null. The tab's host (Lightning, Setup, My Domain) is mapped
 * to its my.salesforce.com host, whose cookie the extension may read; the Lightning and Setup
 * domains themselves are not in the host permissions.
 */
export async function orgForUrl(url, deps = {}) {
  let parsed
  try { parsed = new URL(url) } catch { return null }
  const host = toApiHost(parsed.hostname)
  if (!isApiHost(host)) return null
  const orgs = await listOrgs(deps)
  const known = orgs.find((o) => o.host === host)
  if (known) return known
  const policy = await (deps.policy || readManagedPolicy)()
  if (policy.authMode === 'oauth-only' || !hostAllowed(host, policy.allowedOrgDomains)) return null
  const cookie = await (deps.getCookie || getCookie)({ url: `https://${host}`, name: 'sid' })
  const orgId = orgIdFromSid(cookie?.value)
  return orgId ? orgs.find((o) => o.orgId === orgId) || { orgId, host } : null
}

/**
 * `{ host, sid }` for an org, or null when there is no session (logged out) or the policy
 * does not allow it. An OAuth token from Log in with OAuth comes first (`oauth: true`).
 */
export async function sessionFor(orgId, deps = {}) {
  const policy = await (deps.policy || readManagedPolicy)()
  const oauth = await (deps.oauthSession || oauthSession)(orgId)
  if (oauth) return hostAllowed(oauth.host, policy.allowedOrgDomains) ? oauth : null
  if (policy.authMode === 'oauth-only') return null
  const cookies = await (deps.cookies || allSidCookies)()
  const org = groupSessions(cookies).find((o) => o.orgId === orgId)
  if (!org || !hostAllowed(org.host, policy.allowedOrgDomains)) return null
  const cookie = cookies.find((c) => c.domain.replace(/^\./, '') === org.host && orgIdFromSid(c.value) === orgId)
  return cookie ? { host: org.host, sid: cookie.value } : null
}
