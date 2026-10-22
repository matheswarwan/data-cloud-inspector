// The shape of a JSON response without its values: key names, types and array sizes.
// Used for the connection report, so it can be shared (and pasted to Claude) without
// sharing any record data.

const MAX_KEYS = 30

export function describeShape(value, depth = 3) {
  if (value === null) return 'null'
  if (Array.isArray(value)) {
    if (!value.length) return '[]'
    if (depth <= 0) return `[${value.length} × …]`
    return `[${value.length} × ${describeShape(mergeItems(value), depth - 1)}]`
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value)
    if (!keys.length) return '{}'
    if (depth <= 0) return `{ ${keys.length} keys }`
    const shown = keys.slice(0, MAX_KEYS).map((k) => `${k}: ${describeShape(value[k], depth - 1)}`)
    if (keys.length > MAX_KEYS) shown.push(`… ${keys.length - MAX_KEYS} more keys`)
    return `{ ${shown.join(', ')} }`
  }
  return typeof value
}

// The items of an array described as one: objects merged so every key that appears in
// any item shows (first non-null value wins), otherwise the first item.
function mergeItems(items) {
  const objects = items.filter((i) => i && typeof i === 'object' && !Array.isArray(i))
  if (objects.length !== items.length) return items[0]
  const merged = {}
  for (const o of objects.slice(0, 200)) {
    for (const [k, v] of Object.entries(o)) if (merged[k] == null) merged[k] = v
  }
  return merged
}

/** A one-line summary: the size of a list response, or its top-level keys. */
export function summarize(value) {
  if (Array.isArray(value)) return `${value.length} items`
  if (value && typeof value === 'object') {
    const lists = Object.entries(value).filter(([, v]) => Array.isArray(v))
    if (lists.length) return lists.map(([k, v]) => `${k}: ${v.length}`).join(', ')
    const keys = Object.keys(value)
    return keys.slice(0, 6).join(', ') + (keys.length > 6 ? ', …' : '')
  }
  if (typeof value === 'string') return value ? `${value.length} characters of text` : 'empty'
  return String(typeof value)
}
