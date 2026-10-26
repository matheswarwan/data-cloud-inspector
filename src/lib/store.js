// chrome.storage.local as promises. Resolves (never rejects) so the app works without it.

export function storeGet(key, fallback = null) {
  return new Promise((resolve) => {
    try { chrome.storage.local.get(key, (r) => resolve(r?.[key] ?? fallback)) } catch { resolve(fallback) }
  })
}

export function storeSet(key, value) {
  return new Promise((resolve) => {
    try { chrome.storage.local.set({ [key]: value }, () => resolve()) } catch { resolve() }
  })
}

export function storeRemove(keys) {
  return new Promise((resolve) => {
    try { chrome.storage.local.remove(keys, () => resolve()) } catch { resolve() }
  })
}

/** Every stored key and value (Settings lists the caches). */
export function storeAll() {
  return new Promise((resolve) => {
    try { chrome.storage.local.get(null, (r) => resolve(r || {})) } catch { resolve({}) }
  })
}

// Cache for org data that changes more often than metadata (streams, mappings, rulesets, usage,
// segment lists). Kept in chrome.storage.local, so it survives closing the browser (feedback
// #1007; it was session storage before). A value younger than `ttlMs` is used as is. An older one
// (up to `maxAgeMs`) is used at once when the caller passes `onUpdate`, and read again in the
// background; `onUpdate` gets the new value. Without `onUpdate` an old value is read again first.
const MAX_AGE = 7 * 24 * 3600 * 1000
const refreshing = new Set()

export async function orgCached(key, ttlMs, loader, { refresh = false, onUpdate = null, maxAgeMs = MAX_AGE, now = Date.now } = {}) {
  const save = async (value) => { try { await chrome.storage.local.set({ [key]: { at: now(), value } }) } catch { /* too large or unavailable */ } }
  if (!refresh) {
    let hit = null
    try { hit = (await chrome.storage.local.get(key))?.[key] } catch { /* no storage: load */ }
    const age = hit ? now() - hit.at : Infinity
    if (hit && age < ttlMs) return hit.value
    if (hit && onUpdate && age < maxAgeMs) {
      if (!refreshing.has(key)) {
        refreshing.add(key)
        Promise.resolve().then(loader)
          .then(async (value) => { await save(value); onUpdate(value) })
          .catch(() => { /* keep the stored value */ })
          .finally(() => refreshing.delete(key))
      }
      return hit.value
    }
  }
  const value = await loader()
  await save(value)
  return value
}

/** Removes cached org data whose key starts with `prefix` (also copies left in session storage). */
export async function forgetCached(prefix) {
  for (const area of ['local', 'session']) {
    try {
      const all = await chrome.storage[area].get(null)
      const keys = Object.keys(all || {}).filter((k) => k.startsWith(prefix))
      if (keys.length) await chrome.storage[area].remove(keys)
    } catch { /* nothing to forget */ }
  }
}
