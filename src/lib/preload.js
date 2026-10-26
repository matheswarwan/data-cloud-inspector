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

// The steps of Load everything, in order (feedback #1002).
export const PRELOAD_STEPS = [
  { id: 'catalog', label: 'Objects and fields' },
  { id: 'streams', label: 'Data streams' },
  { id: 'mappings', label: 'Mappings' },
  { id: 'recordIds', label: 'Record links' },
  { id: 'usage', label: 'Insights, segments, activations' },
  { id: 'dataGraphs', label: 'Data graphs' },
  { id: 'health', label: 'Health check' },
]

export const plural = (n, word) => `${Number(n).toLocaleString()} ${word}${n === 1 ? '' : 's'}`

/** Counts for the progress bar: finished (done or failed), failed, total. */
export function preloadProgress(steps) {
  const finished = steps.filter((s) => s.status === 'done' || s.status === 'failed').length
  return { finished, failed: steps.filter((s) => s.status === 'failed').length, total: steps.length }
}
