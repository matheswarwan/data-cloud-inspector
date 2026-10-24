// Query builder layout (feedback #124): list or visual, where the SQL is (right, bottom or
// hidden), and the sizes the user dragged: object list width, SQL panel width (right) or
// height (bottom), SQL box height inside the panel, and each step's height (null = fits its
// content). Remembered in this browser.

export const LAYOUT_KEY = 'dci_builderLayout'

export const SIZES = {
  browser: { def: 256, min: 180, max: 520 },
  sqlWidth: { def: 520, min: 320, max: 1400 },
  sqlHeight: { def: 380, min: 180, max: 1200 },
  code: { def: 280, min: 80, max: 1200 },
  step: { min: 60, max: 2000 },
}

export const STEPS = ['structure', 'output', 'filters', 'options']

export function clampSize(value, { min, max }) {
  const n = Number(value)
  if (!Number.isFinite(n)) return min
  return Math.round(Math.min(max, Math.max(min, n)))
}

export function defaultLayout() {
  return {
    visual: false,
    dock: 'right',
    browser: SIZES.browser.def,
    sqlWidth: SIZES.sqlWidth.def,
    sqlHeight: SIZES.sqlHeight.def,
    code: SIZES.code.def,
    steps: Object.fromEntries(STEPS.map((s) => [s, null])),
  }
}

export function normalizeLayout(v) {
  const d = defaultLayout()
  if (!v || typeof v !== 'object') return d
  const size = (k) => (v[k] == null ? d[k] : clampSize(v[k], SIZES[k]))
  const steps = {}
  for (const s of STEPS) steps[s] = v.steps?.[s] == null ? null : clampSize(v.steps[s], SIZES.step)
  return {
    visual: !!v.visual,
    dock: ['right', 'bottom', 'hidden'].includes(v.dock) ? v.dock : d.dock,
    browser: size('browser'),
    sqlWidth: size('sqlWidth'),
    sqlHeight: size('sqlHeight'),
    code: size('code'),
    steps,
  }
}

export function readLayout(storage = globalThis.localStorage) {
  try { return normalizeLayout(JSON.parse(storage?.getItem(LAYOUT_KEY) || 'null')) } catch { return defaultLayout() }
}

export function writeLayout(layout, storage = globalThis.localStorage) {
  try { storage?.setItem(LAYOUT_KEY, JSON.stringify(layout)) } catch { /* no storage */ }
}
