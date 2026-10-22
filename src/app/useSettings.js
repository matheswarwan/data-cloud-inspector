// Settings kept in this browser. The theme sits in localStorage so the first paint
// already has the right colours.

import { reactive, watch } from 'vue'

const THEME = 'dci_theme'

function read(key, fallback) {
  try { return localStorage.getItem(key) || fallback } catch { return fallback }
}

const media = window.matchMedia?.('(prefers-color-scheme: dark)')
const state = reactive({ theme: read(THEME, 'system'), dark: false })

function apply() {
  state.dark = state.theme === 'dark' || (state.theme === 'system' && !!media?.matches)
  document.documentElement.classList.toggle('dark', state.dark)
}

apply()
media?.addEventListener?.('change', apply)
watch(() => state.theme, (t) => {
  try { localStorage.setItem(THEME, t) } catch { /* private window */ }
  apply()
})

export function useSettings() {
  return state
}
