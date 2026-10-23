// Data graphs (GET /ssot/data-graphs/metadata -> { dataGraphMetadata: [...] }). The dev org
// this was built on had none, so the item shape is not known: the viewer reads common keys
// and walks nested lists of objects, and always offers the raw JSON.

const NAME_KEYS = ['developerName', 'name', 'apiName', 'dataGraphName']
const LABEL_KEYS = ['label', 'displayName', 'masterLabel']

export function nameOf(node) {
  for (const k of NAME_KEYS) if (typeof node?.[k] === 'string' && node[k]) return node[k]
  return ''
}

export function labelOf(node) {
  for (const k of LABEL_KEYS) if (typeof node?.[k] === 'string' && node[k]) return node[k]
  return nameOf(node)
}

/** The scalar properties of a node, for a definition list. */
export function scalars(node) {
  return Object.entries(node || {}).filter(([, v]) => v == null || ['string', 'number', 'boolean'].includes(typeof v)).filter(([, v]) => v !== '' && v != null)
}

/**
 * The objects inside a graph as a tree: every nested array of objects that have a name
 * becomes children. `[{ name, label, fields: [names], children }]`.
 */
export function objectTree(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return []
  const out = []
  for (const [key, value] of Object.entries(node)) {
    if (!Array.isArray(value) || !value.length || typeof value[0] !== 'object') continue
    if (/field/i.test(key)) continue
    for (const child of value) {
      const name = nameOf(child)
      if (!name) continue
      const fieldList = Object.entries(child).find(([k, v]) => /field/i.test(k) && Array.isArray(v))?.[1] || []
      out.push({ name, label: labelOf(child), via: key, fields: fieldList.map((f) => (typeof f === 'string' ? f : nameOf(f))).filter(Boolean), children: objectTree(child, depth + 1) })
    }
  }
  return out
}

export async function loadDataGraphs(call, version) {
  const res = await call(`/services/data/v${version}/ssot/data-graphs/metadata`)
  if (!res.ok) throw new Error(res.error || `HTTP ${res.status}`)
  return res.data?.dataGraphMetadata || res.data?.dataGraphs || []
}
