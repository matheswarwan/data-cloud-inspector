// The segment list, shared by the Segments page and the usage step of Preload (feedback
// #1005). Pages of 100 show as they arrive, and loading carries on while you use other
// pages. Refresh keeps the current list on screen until the new one is complete. The list is
// kept in this browser (feedback #1007): shown at once next time, and read again in the
// background when over 30 minutes old.
import { reactive } from 'vue'
import { useOrg } from './useOrg.js'
import { orgCall } from './useCatalog.js'
import { loadSegments } from '../lib/segments.js'
import { storeGet, storeSet } from '../lib/store.js'

const state = reactive({ key: '', list: [], loading: false, done: false, loaded: 0, total: null, error: '', storedAt: null })
const STORED_TTL = 30 * 60 * 1000
const storeKey = (orgId, dataSpace) => `dci_s_${orgId}_${dataSpace || 'default'}_segments`
let running = null
const keyOf = (org) => `${org.orgId}|${org.version}|${org.dataSpace || 'default'}`

export function useSegments() {
  return state
}

/** Loads the segments of the selected org and data space once; `refresh` reads them again. */
export function ensureSegments({ refresh = false } = {}) {
  const org = useOrg()
  if (!org.orgId || !org.version) return Promise.resolve([])
  const key = keyOf(org)
  if (state.key === key && !refresh) {
    if (running) return running
    if (state.done) return Promise.resolve(state.list)
  }
  let keepOld = state.key === key && state.list.length > 0
  Object.assign(state, { key, list: keepOld ? state.list : [], loading: true, done: false, loaded: 0, total: null, error: '', storedAt: keepOld ? state.storedAt : null })
  const { orgId, dataSpace, version } = org
  const call = orgCall()
  const p = (async () => {
    if (!refresh && !keepOld) {
      const hit = await storeGet(storeKey(orgId, dataSpace))
      if (state.key !== key) return []
      if (hit?.value?.length) {
        Object.assign(state, { list: hit.value, storedAt: hit.at })
        if (Date.now() - hit.at < STORED_TTL) { state.done = true; return hit.value }
        keepOld = true // older: show it while the new list loads
      }
    }
    const list = await loadSegments(call, version, {
      onPage: (items, total) => {
        if (state.key !== key) return
        Object.assign(state, { loaded: items.length, total: total ?? null })
        if (!keepOld) state.list = items
      },
    })
    const at = Date.now()
    await storeSet(storeKey(orgId, dataSpace), { at, value: JSON.parse(JSON.stringify(list)) })
    if (state.key === key) Object.assign(state, { list, done: true, storedAt: at })
    return list
  })()
    .catch((err) => { if (state.key === key) state.error = err.message; throw err })
    .finally(() => { if (state.key === key) state.loading = false; if (running === p) running = null })
  running = p
  return p
}
