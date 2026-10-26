// The segment list, shared by the Segments page and the usage step of Preload (feedback
// #1005). Pages of 100 show as they arrive, and loading carries on while you use other
// pages. Refresh keeps the current list on screen until the new one is complete.
import { reactive } from 'vue'
import { useOrg } from './useOrg.js'
import { orgCall } from './useCatalog.js'
import { loadSegments } from '../lib/segments.js'

const state = reactive({ key: '', list: [], loading: false, done: false, loaded: 0, total: null, error: '' })
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
  const keepOld = state.key === key && state.list.length > 0
  Object.assign(state, { key, list: keepOld ? state.list : [], loading: true, done: false, loaded: 0, total: null, error: '' })
  const p = loadSegments(orgCall(), org.version, {
    onPage: (items, total) => {
      if (state.key !== key) return
      Object.assign(state, { loaded: items.length, total: total ?? null })
      if (!keepOld) state.list = items
    },
  })
    .then((list) => { if (state.key === key) Object.assign(state, { list, done: true }); return list })
    .catch((err) => { if (state.key === key) state.error = err.message; throw err })
    .finally(() => { if (state.key === key) state.loading = false; if (running === p) running = null })
  running = p
  return p
}
