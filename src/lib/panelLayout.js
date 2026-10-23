// Width and visibility of a page's left list (ListPanel), remembered per page.

export const PANEL_MIN = 200
export const PANEL_MAX = 640

export function clampWidth(w, max = PANEL_MAX) {
  return Math.round(Math.min(Math.max(PANEL_MIN, max), Math.max(PANEL_MIN, Number(w) || PANEL_MIN)))
}

export function readPanel(key, width) {
  try {
    const v = JSON.parse(localStorage.getItem(`dci_panel_${key}`) || 'null')
    if (v && typeof v === 'object') return { width: clampWidth(v.width ?? width), hidden: !!v.hidden }
  } catch { /* no storage */ }
  return { width, hidden: false }
}

export function writePanel(key, state) {
  try { localStorage.setItem(`dci_panel_${key}`, JSON.stringify({ width: state.width, hidden: state.hidden })) } catch { /* no storage */ }
}
