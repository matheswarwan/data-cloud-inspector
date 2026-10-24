// JSON viewer helpers (feedback #115): paths for copying, a search over keys and values, and
// a graph of the objects and arrays inside (each a box listing its plain values, joined to its
// children), like jsoncrack.com.

/** `$.a[0].b` for a path of keys and indexes. */
export function jsonPath(path) {
  return path.reduce((s, k) => (typeof k === 'number' ? `${s}[${k}]` : /^[A-Za-z_$][\w$]*$/.test(k) ? `${s}.${k}` : `${s}[${JSON.stringify(k)}]`), '$')
}

export const kindOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v)
export const isBranch = (v) => v !== null && typeof v === 'object'

/** Parses a JSON text; `{ ok, value }` or `{ ok: false, error }`. Values that are not text pass through. */
export function parseJson(v) {
  if (typeof v !== 'string') return { ok: true, value: v }
  try { return { ok: true, value: JSON.parse(v) } } catch (err) { return { ok: false, error: err.message } }
}

/** Paths (as `jsonPath` strings) whose key or plain value contains `text`, and every parent of them. */
export function searchPaths(value, text, limit = 2000) {
  const t = String(text || '').trim().toLowerCase()
  const hits = new Set()
  const open = new Set()
  if (!t) return { hits, open }
  const walk = (v, path) => {
    if (hits.size >= limit) return
    if (isBranch(v)) {
      for (const [k, x] of Object.entries(v)) {
        const p = [...path, Array.isArray(v) ? Number(k) : k]
        if (String(k).toLowerCase().includes(t) || (!isBranch(x) && String(x).toLowerCase().includes(t))) {
          hits.add(jsonPath(p))
          for (let i = 0; i < p.length; i++) open.add(jsonPath(p.slice(0, i)))
        }
        walk(x, p)
      }
    }
  }
  walk(value, [])
  return { hits, open }
}

const preview = (v) => {
  if (typeof v === 'string') return v.length > 60 ? `"${v.slice(0, 59)}…"` : JSON.stringify(v)
  return String(v)
}

/**
 * Boxes and lines for the Graph view: one box per object or array with its plain values (at most
 * `maxRows`), a line to each child object or array labelled with the key. Stops at `maxNodes`.
 */
export function jsonGraph(value, { maxNodes = 250, maxRows = 12 } = {}) {
  const nodes = []
  const edges = []
  let truncated = false
  const add = (v, path, label) => {
    if (nodes.length >= maxNodes) { truncated = true; return null }
    const id = `n${nodes.length}`
    const entries = Object.entries(v)
    const plain = entries.filter(([, x]) => !isBranch(x))
    const node = {
      id, path: jsonPath(path), title: label, kind: Array.isArray(v) ? 'array' : 'object',
      rows: plain.slice(0, maxRows).map(([k, x]) => ({ k: Array.isArray(v) ? `[${k}]` : k, v: preview(x), type: kindOf(x) })),
      more: Math.max(0, plain.length - maxRows), size: entries.length,
    }
    nodes.push(node)
    for (const [k, x] of entries) {
      if (!isBranch(x)) continue
      const childLabel = Array.isArray(v) ? `${label}[${k}]` : k
      const child = add(x, [...path, Array.isArray(v) ? Number(k) : k], childLabel)
      if (child) edges.push({ id: `e${edges.length}`, from: id, to: child.id, label: Array.isArray(v) ? `[${k}]` : k })
    }
    return node
  }
  if (isBranch(value)) add(value, [], Array.isArray(value) ? `array (${value.length})` : 'root')
  else nodes.push({ id: 'n0', path: '$', title: 'value', kind: kindOf(value), rows: [{ k: '', v: preview(value), type: kindOf(value) }], more: 0, size: 1 })
  for (const n of nodes) {
    n.width = Math.min(380, Math.max(150, 16 + 6.6 * Math.max(n.title.length + 8, ...n.rows.map((r) => r.k.length + r.v.length + 2))))
    n.height = 26 + Math.max(1, n.rows.length + (n.more ? 1 : 0)) * 16 + 6
  }
  return { nodes, edges, truncated }
}
