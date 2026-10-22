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
