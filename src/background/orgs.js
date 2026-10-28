// Finding the orgs the browser is logged in to, from Salesforce `sid` cookies.
//
// Same approach as Salesforce Inspector Reloaded: the session on *.lightning.force.com
// and *.visual.force.com has no API access, but the session on the org's
// *.my.salesforce.com domain does. A sid starts with the 15-character org ID and a `!`,
// so cookies are grouped by that prefix (several orgs can be logged in at once).

// Domains the API session can live on. help/login/test pages set their own sid.
const API_SUFFIXES = ['.my.salesforce.com', '.cloudforce.com']
const NOT_ORGS = new Set(['help.salesforce.com', 'login.salesforce.com', 'test.salesforce.com', 'trailhead.salesforce.com'])

export function orgIdFromSid(value) {
  const [orgId] = String(value ?? '').split('!')
  return /^00D[a-zA-Z0-9]{12}$/.test(orgId) ? orgId : null
}

/**
 * The my.salesforce.com host for any org host. Calling the lightning host would
 * redirect, and the browser drops the Authorization header on a redirect.
 */
export function toApiHost(host) {
  if (!host) return host
  return host
    .replace(/^\./, '')
    .replace(/\.lightning\.force\./, '.my.salesforce.')
    .replace(/\.lightning\.([^.]+)\.force\.com$/, '.my.$1.salesforce.com')
    .replace(/\.my\.salesforce-setup\.com$/, '.my.salesforce.com')
}

export function isApiHost(host) {
  const h = String(host ?? '').replace(/^\./, '')
  return !NOT_ORGS.has(h) && API_SUFFIXES.some((s) => h.endsWith(s))
}

/**
 * One entry per org from a list of sid cookies: `{ orgId, host }`. A *.my.salesforce.com
 * host wins over other API hosts of the same org. Sorted by host.
 */
export function groupSessions(cookies) {
  const byOrg = new Map()
  for (const c of cookies || []) {
    const orgId = orgIdFromSid(c.value)
    const host = String(c.domain ?? '').replace(/^\./, '')
    if (!orgId || !isApiHost(host)) continue
    const current = byOrg.get(orgId)
    const isMy = host.includes('.my.')
    if (!current || (isMy && !current.host.includes('.my.'))) byOrg.set(orgId, { orgId, host })
  }
  return [...byOrg.values()].sort((a, b) => a.host.localeCompare(b.host))
}
