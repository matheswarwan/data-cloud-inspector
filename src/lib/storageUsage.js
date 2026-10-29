// What the extension keeps in the browser, grouped for Settings > Storage, with sizes.
// Three places: chrome.storage.local (kept until deleted), chrome.storage.session (gone when
// the browser closes) and the page's localStorage (small settings).

const GROUPS = [
  { id: 'metadata', area: 'local', label: 'Cached metadata', test: (k) => k.startsWith('dci_catalog_'), perOrg: true, note: 'Object and field names per org and data space. Loads again when needed.' },
  { id: 'saved', area: 'local', label: 'Saved queries', test: (k) => k === 'dci_savedQueries', note: 'Your saved SQL. Export them in Saved queries first if you want to keep them.' },
  { id: 'history', area: 'local', label: 'Query history', test: (k) => k === 'dci_history', note: 'The last 50 queries run.' },
  { id: 'feedback', area: 'local', label: 'Feedback name and email', test: (k) => k === 'dci_feedbackContact' },
  { id: 'jobs', area: 'local', label: 'Health results', test: (k) => k.startsWith('dci_job_'), perOrg: true, note: 'The last check per org, shown at once when the page opens. Checked again in the background.' },
  { id: 'sessionJobs', area: 'session', label: 'Bulk lookup and Compare results', test: (k) => k.startsWith('dci_job_'), perOrg: true, note: "People's data from the last lookup or comparison per org. Gone when the browser closes." },
  { id: 'oauthClients', area: 'local', label: 'OAuth client IDs', test: (k) => k.startsWith('dci_oauthClient_'), note: 'Client IDs typed in Log in with OAuth.' },
  { id: 'orgData', area: 'local', label: 'Cached org data', test: (k) => k.startsWith('dci_s_'), perOrg: true, note: 'Streams, mappings, usage, record IDs, rulesets, segments, activations, insights, flows, campaigns and data graphs (setup, not records). Shown at once and read again in the background once older than Keep org details (a day by default).' },
  { id: 'session', area: 'session', label: 'Session cache', test: (k) => k.startsWith('dci_s_') || k.startsWith('dci_catalog_'), perOrg: true, note: 'Org metadata kept only until the browser closes (your administrator turned off the cache, or an older version left it).' },
  { id: 'oauthTokens', area: 'session', label: 'OAuth logins', test: (k) => k.startsWith('dci_oauth_'), note: 'Access tokens from Log in with OAuth. Deleting logs out of OAuth.' },
  { id: 'page', area: 'page', label: 'Page settings', test: (k) => k.startsWith('dci_'), note: 'Theme, last org, SQL draft, editor layout, chosen data space and ruleset.' },
]

export const ORG_RE = /00D[a-zA-Z0-9]{12}/

/** `[{ id, area, label, note, keys, bytes, byOrg: [{ orgId, keys, bytes }] }]` with empty groups left out. */
export function groupStorage(entries) {
  // entries: [{ area, key, bytes }]
  const out = []
  for (const g of GROUPS) {
    const mine = entries.filter((e) => e.area === g.area && g.test(e.key))
    if (!mine.length) continue
    const group = { id: g.id, area: g.area, label: g.label, note: g.note || '', keys: mine.map((e) => e.key), bytes: mine.reduce((n, e) => n + e.bytes, 0), byOrg: [] }
    if (g.perOrg) {
      const m = new Map()
      for (const e of mine) {
        const orgId = e.key.match(ORG_RE)?.[0] || 'other'
        const o = m.get(orgId) || { orgId, keys: [], bytes: 0 }
        o.keys.push(e.key)
        o.bytes += e.bytes
        m.set(orgId, o)
      }
      group.byOrg = [...m.values()].sort((a, b) => b.bytes - a.bytes)
    }
    out.push(group)
  }
  return out
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

// ---- reading and deleting (browser APIs) ----

async function areaEntries(area) {
  const store = chrome.storage[area]
  const all = await store.get(null)
  const keys = Object.keys(all || {})
  const sizes = await Promise.all(keys.map((k) => (store.getBytesInUse ? store.getBytesInUse(k) : Promise.resolve(JSON.stringify(all[k]).length))))
  return keys.map((key, i) => ({ area, key, bytes: sizes[i] }))
}

function pageEntries() {
  const out = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      out.push({ area: 'page', key, bytes: 2 * (key.length + (localStorage.getItem(key) || '').length) })
    }
  } catch { /* no localStorage */ }
  return out
}

export async function readStorage() {
  const [local, session] = await Promise.all([areaEntries('local').catch(() => []), areaEntries('session').catch(() => [])])
  const entries = [...local, ...session, ...pageEntries()]
  return { entries, groups: groupStorage(entries), total: entries.reduce((n, e) => n + e.bytes, 0) }
}

export async function deleteKeys(area, keyList) {
  // A plain array: chrome.storage refuses Vue's reactive proxies ("No matching signature").
  const keys = Array.from(keyList || [], String)
  if (!keys.length) return
  if (area === 'page') { for (const k of keys) { try { localStorage.removeItem(k) } catch { /* ignore */ } } return }
  await chrome.storage[area].remove(keys)
}
