// Orgs this browser has connected to (feedback #109), so Home can list them when the session
// has expired: open their login page, name them, forget them. Kept in chrome.storage.local
// as { [orgId]: { orgId, host, name, username, lastConnected } }; no session or token.

/** Remembers an org after a successful connection; keeps the name the user gave it. */
export function rememberOrg(saved, { orgId, host, username = '' }, now = new Date().toISOString()) {
  if (!orgId || !host) return saved
  const prev = saved[orgId] || {}
  return { ...saved, [orgId]: { orgId, host, name: prev.name || '', username: username || prev.username || '', lastConnected: now } }
}

/** Names an org (feedback #140: an alias shown instead of the domain). An org never saved
 * is added when its `host` is given (for example a second org picked on Compare). */
export function renameOrg(saved, orgId, name, host = '') {
  const prev = saved[orgId] || (host && orgId ? { orgId, host, name: '', username: '', lastConnected: '' } : null)
  if (!prev) return saved
  return { ...saved, [orgId]: { ...prev, name: String(name || '').trim().slice(0, 80) } }
}

/** What to call an org on screen and in reports: its name, else its domain. */
export function orgLabel(saved, orgId, host = '') {
  return saved?.[orgId]?.name || host || saved?.[orgId]?.host || orgId || ''
}

export function forgetOrgs(saved, orgIds) {
  const gone = new Set(orgIds)
  return Object.fromEntries(Object.entries(saved).filter(([id]) => !gone.has(id)))
}

/**
 * Rows for Home: every saved org, plus orgs with a session cookie now that were never saved.
 * `status`: 'connected' (selected, no problem), 'problem' (selected, the session was refused),
 * 'session' (a session cookie is there), 'none' (log in to use it).
 */
export function savedOrgRows(saved, liveOrgs, { currentId = null, problem = null } = {}) {
  const live = new Map(liveOrgs.map((o) => [o.orgId, o]))
  const ids = [...new Set([...Object.keys(saved), ...live.keys()])]
  return ids.map((id) => {
    const s = saved[id] || {}
    const l = live.get(id)
    const status = id === currentId ? (problem ? 'problem' : 'connected') : l ? 'session' : 'none'
    return { orgId: id, host: s.host || l?.host || '', name: s.name || '', username: s.username || '', lastConnected: s.lastConnected || '', saved: !!saved[id], status }
  }).sort((a, b) => (b.lastConnected || '').localeCompare(a.lastConnected || '') || a.host.localeCompare(b.host))
}

/** The page to log in to an org: its own domain, which sends you to its login page. */
export function loginUrl(host) {
  return host ? `https://${host}/` : ''
}
