import { describe, it, expect, beforeEach, vi } from 'vitest'
import { orgCached, forgetCached, keysToFree, storeSet } from '../store.js'

// A fake chrome.storage with local and session areas.
function fakeArea() {
  const data = {}
  return {
    data,
    get: async (k) => (k == null ? { ...data } : k in data ? { [k]: data[k] } : {}),
    set: async (o) => { Object.assign(data, o) },
    remove: async (keys) => { for (const k of [].concat(keys)) delete data[k] },
  }
}

describe('org data kept in this browser (feedback #1007)', () => {
  beforeEach(() => { globalThis.chrome = { storage: { local: fakeArea(), session: fakeArea() } } })

  it('stores in local storage and uses a fresh value', async () => {
    const loader = vi.fn(async () => ['a'])
    expect(await orgCached('dci_s_x_streams', 1000, loader)).toEqual(['a'])
    expect(chrome.storage.local.data.dci_s_x_streams.value).toEqual(['a'])
    expect(await orgCached('dci_s_x_streams', 1000, loader)).toEqual(['a'])
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('shows an old value at once and updates it in the background', async () => {
    chrome.storage.local.data.k = { at: 0, value: 'old' }
    let updated = null
    const v = await orgCached('k', 1000, async () => 'new', { onUpdate: (x) => { updated = x }, now: () => 5000 })
    expect(v).toBe('old')
    await new Promise((r) => setTimeout(r, 0))
    expect(updated).toBe('new')
    expect(chrome.storage.local.data.k.value).toBe('new')
  })

  it('reads an old value again first when nobody listens for the update', async () => {
    chrome.storage.local.data.k = { at: 0, value: 'old' }
    expect(await orgCached('k', 1000, async () => 'new', { now: () => 5000 })).toBe('new')
  })

  it('forgets from both areas', async () => {
    chrome.storage.local.data.dci_s_00D_a = { at: 1, value: 1 }
    chrome.storage.session.data.dci_s_00D_b = { at: 1, value: 1 }
    chrome.storage.local.data.dci_catalog_00D = {}
    await forgetCached('dci_s_00D_')
    expect(Object.keys(chrome.storage.local.data)).toEqual(['dci_catalog_00D'])
    expect(Object.keys(chrome.storage.session.data)).toEqual([])
  })
})

describe('storage full (feedback #1061)', () => {
  // An area that refuses writes once it holds more than `limit` keys.
  function smallArea(limit) {
    const a = fakeArea()
    a.set = async (o) => {
      const next = { ...a.data, ...o }
      if (Object.keys(next).length > limit) throw new Error('Resource::kQuotaBytes quota exceeded')
      Object.assign(a.data, o)
    }
    return a
  }

  it('drops other orgs\' caches first, then this org\'s, never saved data', async () => {
    expect(keysToFree(['dci_s_A_x', 'dci_catalog_B', 'dci_s_B_y', 'dci_saved', 'dci_s_A_new'], 'dci_s_A_new')).toEqual([['dci_catalog_B', 'dci_s_B_y'], ['dci_s_A_x']])
  })

  it('makes room and writes', async () => {
    globalThis.chrome = { storage: { local: smallArea(3), session: fakeArea() } }
    Object.assign(chrome.storage.local.data, { dci_saved: [1], dci_catalog_B: {}, dci_s_A_old: 1 })
    expect(await storeSet('dci_s_A_new', 2)).toBe(true)
    expect(Object.keys(chrome.storage.local.data).sort()).toEqual(['dci_s_A_new', 'dci_s_A_old', 'dci_saved'])
  })

  it('gives up quietly when nothing can be dropped', async () => {
    globalThis.chrome = { storage: { local: smallArea(1), session: fakeArea() } }
    chrome.storage.local.data.dci_saved = [1]
    expect(await storeSet('dci_history', [2])).toBe(false)
    expect(chrome.storage.local.data.dci_saved).toEqual([1])
    expect(await orgCached('dci_s_A_x', 1000, async () => 'v')).toBe('v')
  })
})
