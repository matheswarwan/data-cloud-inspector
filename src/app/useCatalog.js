// The selected org's Data Cloud objects, kept in chrome.storage.local per org (the
// metadata calls take a few seconds) until Refresh. Streams and mappings stay in memory.

import { reactive, watch } from 'vue'
import { sf } from '../lib/api.js'
import { loadCatalog } from '../lib/catalog.js'
import { loadStreams, loadAllMappings } from '../lib/lineage.js'
import { storeGet, storeSet } from '../lib/store.js'
import { useOrg } from './useOrg.js'

const org = useOrg()
const state = reactive({
  orgId: null, objects: [], errors: [], loadedAt: '', loading: false, error: '',
  streams: null, mappings: null, mappingsProgress: '',
})

export function orgCall() {
  const orgId = org.orgId
  return (path, opts) => sf(orgId, path, opts)
}

const cacheKey = (orgId) => `dci_catalog_${orgId}`

export async function ensureCatalog({ refresh = false } = {}) {
  const { orgId, version } = org
  if (!orgId || !version) return
  if (!refresh && state.orgId === orgId && (state.objects.length || state.loading)) return
  if (state.orgId !== orgId) Object.assign(state, { objects: [], errors: [], loadedAt: '', streams: null, mappings: null })
  state.orgId = orgId
  state.error = ''
  if (!refresh) {
    const cached = await storeGet(cacheKey(orgId))
    if (cached?.objects?.length) {
      Object.assign(state, cached)
      return
    }
  }
  state.loading = true
  try {
    const catalog = await loadCatalog(orgCall(), version)
    if (state.orgId !== orgId) return
    Object.assign(state, catalog, { streams: null, mappings: null })
    if (catalog.objects.length) await storeSet(cacheKey(orgId), catalog)
  } catch (err) {
    state.error = err.message
  } finally {
    state.loading = false
  }
}

export async function ensureStreams() {
  if (state.streams || !org.version) return state.streams
  state.streams = await loadStreams(orgCall(), org.version).catch((err) => { state.error = err.message; return null })
  return state.streams
}

export async function ensureAllMappings() {
  if (state.mappings || !org.version) return state.mappings
  const dmos = state.objects.filter((o) => o.kind === 'DMO').map((o) => o.name)
  state.mappings = await loadAllMappings(orgCall(), org.version, dmos, {
    onProgress: (done, total) => { state.mappingsProgress = `${done} of ${total} DMOs` },
  })
  state.mappingsProgress = ''
  return state.mappings
}

watch(() => [org.orgId, org.version], () => { ensureCatalog() })

export function useCatalog() {
  return state
}
