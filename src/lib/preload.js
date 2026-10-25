// Preload when connected (feedback #147): read the metadata and run the Health check in the
// background as soon as an org is connected, so pages open without a wait. On by default;
// Settings > Tools turns it off (localStorage `dci_preload` = 'off').

const KEY = 'dci_preload'

export function preloadOn(storage = globalThis.localStorage) {
  try { return storage?.getItem(KEY) !== 'off' } catch { return true }
}

export function setPreloadOn(on, storage = globalThis.localStorage) {
  try { storage?.setItem(KEY, on ? 'on' : 'off') } catch { /* private window */ }
}

/** Whether a stored Health result is old enough to check again (default: an hour). */
export function stale(finishedAt, { maxAgeMs = 3600000, now = Date.now() } = {}) {
  const t = Date.parse(finishedAt || '')
  return Number.isNaN(t) || now - t > maxAgeMs
}
