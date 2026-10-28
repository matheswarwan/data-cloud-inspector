// Policy an administrator sets for the extension (chrome.storage.managed, schema in
// public/managed_schema.json). Read by the service worker and the app. Without a policy
// everything is at its default. Users cannot change these values.
//
//   authMode             'session-or-oauth' (default) | 'oauth-only': never read the sid cookie
//   allowedOrgDomains    ['acme.my.salesforce.com', '*.acme.my.salesforce.com', ...]; empty = any
//   disableCache         true: org metadata caches and Health results end with the browser session
//   disableQueryHistory  true: no SQL run history
//   disableDiagramforce  true: no Open in Diagramforce

export const DEFAULT_POLICY = Object.freeze({
  authMode: 'session-or-oauth',
  allowedOrgDomains: [],
  disableCache: false,
  disableQueryHistory: false,
  disableDiagramforce: false,
})

/** A clean policy from whatever chrome.storage.managed holds (wrong types are ignored). */
export function normalizePolicy(raw) {
  const r = raw && typeof raw === 'object' ? raw : {}
  const bool = (k) => (typeof r[k] === 'boolean' ? r[k] : DEFAULT_POLICY[k])
  const domains = Array.isArray(r.allowedOrgDomains)
    ? r.allowedOrgDomains.map((d) => String(d || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')).filter(Boolean)
    : []
  return {
    authMode: r.authMode === 'oauth-only' ? 'oauth-only' : 'session-or-oauth',
    allowedOrgDomains: domains,
    disableCache: bool('disableCache'),
    disableQueryHistory: bool('disableQueryHistory'),
    disableDiagramforce: bool('disableDiagramforce'),
  }
}

/** The keys an administrator set to something other than the default (for Settings). */
export function policyOverrides(policy) {
  return Object.keys(DEFAULT_POLICY).filter((k) => JSON.stringify(policy[k]) !== JSON.stringify(DEFAULT_POLICY[k]))
}

/** Whether an org host is allowed: exact host, or `*.suffix` for any host under suffix. */
export function hostAllowed(host, allowed) {
  if (!allowed?.length) return true
  const h = String(host || '').toLowerCase().replace(/^\./, '')
  return allowed.some((p) => (p.startsWith('*.') ? h.endsWith(p.slice(1)) : h === p))
}

export function readManagedPolicy(storage = globalThis.chrome?.storage?.managed) {
  return new Promise((resolve) => {
    try { storage.get(null, (r) => resolve(normalizePolicy(r))) } catch { resolve(normalizePolicy(null)) }
  })
}

// The app reads the policy once before it mounts (main.js) and then uses it synchronously.
let current = normalizePolicy(null)
export async function loadPolicy() {
  current = await readManagedPolicy()
  return current
}
export const policy = () => current
export function setPolicyForTest(p) { current = normalizePolicy(p) }
