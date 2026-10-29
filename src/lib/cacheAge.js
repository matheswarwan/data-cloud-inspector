// How long org details read from the org (segments, activations, insights, streams, mappings,
// flows, campaigns, data graphs) are used from this browser before they are read again
// (feedback #1043). Older copies still show at once and refresh in the background; Refresh on
// a page or in the connection menu reads them now. People's records are never kept.

export const CACHE_AGES = [
  { hours: 1, label: '1 hour' },
  { hours: 6, label: '6 hours' },
  { hours: 24, label: '1 day' },
  { hours: 168, label: '7 days' },
]
const KEY = 'dci_cache_hours'
const DEFAULT_HOURS = 24

export function cacheHours() {
  try {
    const v = Number(localStorage.getItem(KEY))
    return CACHE_AGES.some((a) => a.hours === v) ? v : DEFAULT_HOURS
  } catch { return DEFAULT_HOURS }
}

export function setCacheHours(hours) {
  try { localStorage.setItem(KEY, String(hours)) } catch { /* private window */ }
}

/** Age under which a stored copy is used without reading the org again, in ms. */
export const metadataTtl = () => cacheHours() * 3600 * 1000
