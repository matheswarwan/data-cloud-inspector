// Ctrl/Cmd+K: one search over pages, objects, fields, segments and saved queries, plus
// "Find person". Items are `{ kind, label, detail, to }` with `to` a router location.

export function paletteItems({ pages = [], objects = [], segments = [], saved = [] }) {
  const items = pages.map((p) => ({ kind: 'Page', label: p.label, detail: '', to: { path: p.path } }))
  for (const o of objects) {
    items.push({ kind: o.kind, label: o.label, detail: o.name, to: { path: `/objects/${o.name}` } })
    for (const f of o.fields) items.push({ kind: 'Field', label: f.name, detail: `${o.label} · ${f.label}`, to: { path: `/objects/${o.name}`, query: { field: f.name } } })
  }
  for (const s of segments) items.push({ kind: 'Segment', label: s.label, detail: s.apiName, to: { path: `/segments/${s.apiName}` } })
  for (const q of saved) items.push({ kind: 'Query', label: q.name, detail: q.sql.replace(/\s+/g, ' ').slice(0, 80), to: { path: '/sql', query: { sql: q.sql } } })
  return items
}

/** Matches, best first: exact, then prefix, then word prefix, then anywhere; at most `limit`. */
export function searchPalette(items, text, { limit = 40 } = {}) {
  const t = text.trim().toLowerCase()
  const actions = t ? [{ kind: 'Action', label: `Find person: ${text.trim()}`, detail: 'Search People by email, phone, name or ID', to: { path: '/profile', query: { q: text.trim() } } }] : []
  if (!t) return [...actions, ...items.filter((i) => i.kind === 'Page')].slice(0, limit)
  const scored = []
  for (const i of items) {
    const l = i.label.toLowerCase()
    const d = i.detail.toLowerCase()
    let score = -1
    if (l === t) score = 0
    else if (l.startsWith(t)) score = 1
    else if (l.split(/[\s_.-]+/).some((w) => w.startsWith(t))) score = 2
    else if (l.includes(t)) score = 3
    else if (d.includes(t)) score = 4
    if (score >= 0) scored.push([score + (i.kind === 'Field' ? 0.5 : 0), i])
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].label.length - b[1].label.length)
  return [...scored.slice(0, limit - 1).map(([, i]) => i), ...actions]
}
