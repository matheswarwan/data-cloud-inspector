// A page laid out as movable blocks (design "Option D – Credit prediction", Customize layout):
// an order and a width (half or full) per block, saved in this browser.

/** The saved layout made safe: every known block once, in the saved order, then any new ones. */
export function normalizeLayout(saved, keys, defSpan) {
  const order = [...new Set((saved?.order || []).filter((k) => keys.includes(k)))]
  for (const k of keys) if (!order.includes(k)) order.push(k)
  const span = { ...defSpan }
  for (const [k, v] of Object.entries(saved?.span || {})) if (keys.includes(k) && (v === 'half' || v === 'full')) span[k] = v
  return { order, span }
}

/** The order with the block at `from` moved to `to`. */
export function moveKey(order, from, to) {
  if (from === to || from < 0 || to < 0 || from >= order.length || to >= order.length) return order
  const next = order.slice()
  const [it] = next.splice(from, 1)
  next.splice(to, 0, it)
  return next
}

export function loadLayout(storeKey, keys, defSpan) {
  let saved = null
  try { saved = JSON.parse(localStorage.getItem(storeKey) || 'null') } catch { /* private window */ }
  return normalizeLayout(saved, keys, defSpan)
}

export function saveLayout(storeKey, layout) {
  try { localStorage.setItem(storeKey, JSON.stringify(layout)) } catch { /* private window */ }
}
