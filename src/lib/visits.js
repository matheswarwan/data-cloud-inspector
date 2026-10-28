// Which pages are opened most (Home's "Most used", feedback #106). Kept in this browser only.
const KEY = 'dci_visits'

/** The sidebar page a path belongs to: the longest NAV path it starts with (not Home). */
export function pageOf(path, navPaths) {
  const hits = navPaths.filter((p) => p !== '/' && (path === p || path.startsWith(`${p}/`)))
  return hits.sort((a, b) => b.length - a.length)[0] || ''
}

export function readVisits() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' ? v : {} } catch { return {} }
}

export function recordVisit(path, navPaths, now = Date.now()) {
  const page = pageOf(path, navPaths)
  if (!page) return
  const v = readVisits()
  v[page] = { n: (v[page]?.n || 0) + 1, at: now }
  try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { /* no storage */ }
}

/** The most opened pages, most first (ties: most recent first). */
export function topVisits(limit = 6, visits = readVisits()) {
  return Object.entries(visits).sort(([, a], [, b]) => b.n - a.n || b.at - a.at).slice(0, limit).map(([path, x]) => ({ path, ...x }))
}

/** Exactly `n` pages for Home's cards: `most` first, then `starters` (paths), then the rest of `pages`. */
export function fillCards(most, starters, pages, n = 6) {
  const out = [...most]
  const seen = new Set(out.map((p) => p.path))
  const add = (p) => { if (p && !seen.has(p.path) && out.length < n) { seen.add(p.path); out.push(p) } }
  starters.forEach((path) => add(pages.find((p) => p.path === path)))
  pages.forEach(add)
  return out.slice(0, n)
}
