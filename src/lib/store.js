// chrome.storage.local as promises. Resolves (never rejects) so the app works without it.
import { policy } from './policy.js'

/** Where org metadata caches go: local, or session when the administrator set disableCache. */
export const cacheArea = (p = policy()) => (p.disableCache ? 'session' : 'local')

export function cacheGet(key, fallback = null) {
  return new Promise((resolve) => {
    try { chrome.storage[cacheArea()].get(key, (r) => resolve(r?.[key] ?? fallback)) } catch { resolve(fallback) }
  })
}

export function cacheSet(key, value) {
  return setRoomy(cacheArea(), key, value)
}

export function storeGet(key, fallback = null) {
  return new Promise((resolve) => {
    try { chrome.storage.local.get(key, (r) => resolve(r?.[key] ?? fallback)) } catch { resolve(fallback) }
  })
}

export function storeSet(key, value) {
  return setRoomy('local', key, value)
}

// Storage holds 10 MB per area (no unlimitedStorage since 1.0.8), and a large org's caches can
// fill it (feedback #1061: "kQuotaBytes quota exceeded"). When a write does not fit, cached org
// data is dropped to make room and the write is tried again: first other orgs' caches, then
// this org's other caches. Saved queries, history, orgs and settings are never dropped.
// Resolves true when written; never rejects.
const CACHE_KEY = /^dci_(s|catalog)_([A-Za-z0-9]+)/
const orgOfKey = (key) => CACHE_KEY.exec(key)?.[2] || ''

// The promise form: a failed write rejects instead of logging "Unchecked runtime.lastError".
async function rawSet(area, items) {
  try { await chrome.storage[area].set(items); return '' } catch (err) { return err?.message || 'error' }
}

/** Cache keys to drop to make room for `key`, in order: other orgs' caches, then this org's other caches. */
export function keysToFree(allKeys, key) {
  const org = orgOfKey(key)
  const caches = allKeys.filter((k) => k !== key && CACHE_KEY.test(k))
  const other = caches.filter((k) => !org || orgOfKey(k) !== org)
  const same = caches.filter((k) => org && orgOfKey(k) === org)
  return [other, same].filter((list) => list.length)
}

export async function setRoomy(area, key, value) {
  let err = await rawSet(area, { [key]: value })
  if (!err) return true
  if (!/quota/i.test(err)) return false
  let all = {}
  try { all = (await chrome.storage[area].get(null)) || {} } catch { return false }
  for (const drop of keysToFree(Object.keys(all), key)) {
    try { await chrome.storage[area].remove(drop) } catch { return false }
    err = await rawSet(area, { [key]: value })
    if (!err) return true
    if (!/quota/i.test(err)) return false
  }
  return false
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
// #1007; it was session storage before), or in session storage under disableCache. A value younger than `ttlMs` is used as is. An older one
// (up to `maxAgeMs`) is used at once when the caller passes `onUpdate`, and read again in the
// background; `onUpdate` gets the new value. Without `onUpdate` an old value is read again first.
const MAX_AGE = 7 * 24 * 3600 * 1000
const refreshing = new Set()

export async function orgCached(key, ttlMs, loader, { refresh = false, onUpdate = null, maxAgeMs = MAX_AGE, now = Date.now } = {}) {
  const area = cacheArea()
  const save = (value) => setRoomy(area, key, { at: now(), value })
  if (!refresh) {
    let hit = null
    try { hit = (await chrome.storage[area].get(key))?.[key] } catch { /* no storage: load */ }
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
