// Home's sections (feedback #1022): their order and which are folded, remembered in this
// browser. Unknown ids are dropped and new sections join at their default place.
export const HOME_SECTIONS = ['connection', 'user', 'loaded', 'most', 'orgs', 'recent', 'privacy', 'oauth', 'all']
const DEFAULT_FOLDED = ['oauth']
const KEY = 'dci_homeLayout'

export function normalizeLayout(saved) {
  const known = new Set(HOME_SECTIONS)
  const order = (Array.isArray(saved?.order) ? saved.order : []).filter((id, i, a) => known.has(id) && a.indexOf(id) === i)
  if (!order.length) return { order: [...HOME_SECTIONS], folded: Array.isArray(saved?.folded) ? saved.folded.filter((id) => known.has(id)) : [...DEFAULT_FOLDED] }
  // A section not in the saved order goes right after the one before it by default.
  HOME_SECTIONS.forEach((id, i) => {
    if (order.includes(id)) return
    const prev = HOME_SECTIONS.slice(0, i).reverse().find((x) => order.includes(x))
    order.splice(prev ? order.indexOf(prev) + 1 : 0, 0, id)
  })
  const folded = Array.isArray(saved?.folded) ? saved.folded.filter((id) => known.has(id)) : [...DEFAULT_FOLDED]
  return { order, folded }
}

export function readLayout() {
  try { return normalizeLayout(JSON.parse(localStorage.getItem(KEY) || 'null')) } catch { return normalizeLayout(null) }
}
export function writeLayout(layout) {
  try { localStorage.setItem(KEY, JSON.stringify(layout)) } catch { /* private window */ }
}

/** `order` with `id` moved to just before `before` (or to the end), or by `step` places. */
export function moveSection(order, id, { before = null, step = 0 } = {}) {
  const rest = order.filter((x) => x !== id)
  if (step) {
    const i = order.indexOf(id)
    const j = Math.min(Math.max(0, i + step), order.length - 1)
    rest.splice(j, 0, id)
    return rest
  }
  const at = before ? rest.indexOf(before) : -1
  rest.splice(at < 0 ? rest.length : at, 0, id)
  return rest
}
