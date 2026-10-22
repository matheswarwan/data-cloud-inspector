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

// Cache for things that change more often than metadata (streams, mappings, rulesets, usage):
// chrome.storage.session lives until the browser closes, and entries expire after `ttlMs`.
export async function sessionCached(key, ttlMs, loader, { refresh = false } = {}) {
  if (!refresh) {
    try {
      const hit = (await chrome.storage.session.get(key))?.[key]
      if (hit && Date.now() - hit.at < ttlMs) return hit.value
    } catch { /* no session storage: load */ }
  }
  const value = await loader()
  try { await chrome.storage.session.set({ [key]: { at: Date.now(), value } }) } catch { /* too large or unavailable */ }
  return value
}

export async function sessionForget(prefix) {
  try {
    const all = await chrome.storage.session.get(null)
    const keys = Object.keys(all || {}).filter((k) => k.startsWith(prefix))
    if (keys.length) await chrome.storage.session.remove(keys)
  } catch { /* nothing to forget */ }
}
