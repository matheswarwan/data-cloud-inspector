// Settings kept in this browser. The theme sits in localStorage so the first paint
// already has the right colours.

import { reactive, watch } from 'vue'

const THEME = 'dci_theme'

function read(key, fallback) {
  try { return localStorage.getItem(key) || fallback } catch { return fallback }
}

const media = window.matchMedia?.('(prefers-color-scheme: dark)')
// Light until chosen otherwise (feedback #1067; it followed the system before). A "system" saved
// by an earlier build becomes Light once, so everyone starts on Light; choosing System again sticks.
const MOVED = 'dci_theme_light_default'
function startTheme() {
  const saved = read(THEME, 'light')
  if (saved !== 'system' || read(MOVED, '')) return saved
  try { localStorage.setItem(MOVED, '1'); localStorage.setItem(THEME, 'light') } catch { /* private window */ }
  return 'light'
}
const state = reactive({ theme: startTheme(), dark: false })

function apply() {
  state.dark = state.theme === 'dark' || (state.theme === 'system' && !!media?.matches)
  document.documentElement.classList.toggle('dark', state.dark)
}

apply()
media?.addEventListener?.('change', apply)
watch(() => state.theme, (t) => {
  try { localStorage.setItem(THEME, t); localStorage.setItem(MOVED, '1') } catch { /* private window */ }
  apply()
})

export function useSettings() {
  return state
}
