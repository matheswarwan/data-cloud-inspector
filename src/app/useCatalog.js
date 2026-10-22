// The selected org's Data Cloud objects, kept in chrome.storage.local per org (the
// metadata calls take a few seconds) until Refresh. Streams and mappings stay in memory.

import { reactive, watch } from 'vue'
import { sf } from '../lib/api.js'
import { loadCatalog } from '../lib/catalog.js'
import { loadStreams, loadAllMappings } from '../lib/lineage.js'
import { loadRecordIds } from '../lib/links.js'
import { loadUsage } from '../lib/usage.js'
import { fetchAllPages } from '../lib/pages.js'
import { storeGet, storeSet, storeRemove, sessionCached, sessionForget } from '../lib/store.js'
import { useOrg } from './useOrg.js'

const org = useOrg()
const state = reactive({
  orgId: null, objects: [], errors: [], loadedAt: '', loading: false, error: '',
  streams: null, mappings: null, mappingsProgress: '', recordIds: null, usage: null,
})

export function orgCall() {
  const orgId = org.orgId
  return (path, opts) => sf(orgId, path, opts)
}

const cacheKey = (orgId) => `dci_catalog_${orgId}`
// Streams, mappings, record IDs and usage change more often than metadata: kept for 30 minutes
// in session storage (gone when the browser closes); Refresh on the Objects page reloads them.
const SESSION_TTL = 30 * 60 * 1000
const sessionKey = (orgId, what) => `dci_s_${orgId}_${what}`

export async function ensureCatalog({ refresh = false } = {}) {
  const { orgId, version } = org
  if (!orgId || !version) return
  if (!refresh && state.orgId === orgId && (state.objects.length || state.loading)) return
  if (state.orgId !== orgId) Object.assign(state, { objects: [], errors: [], loadedAt: '', streams: null, mappings: null, recordIds: null, usage: null })
  state.orgId = orgId
  state.error = ''
  if (refresh) await sessionForget(`dci_s_${orgId}_`)
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
    Object.assign(state, catalog, { streams: null, mappings: null, recordIds: null, usage: null })
    if (catalog.objects.length) await storeSet(cacheKey(orgId), catalog)
  } catch (err) {
    state.error = err.message
  } finally {
    state.loading = false
  }
}

export async function ensureStreams() {
  if (state.streams || !org.version) return state.streams
  const { orgId, version } = org
  state.streams = await sessionCached(sessionKey(orgId, 'streams'), SESSION_TTL, () => loadStreams(orgCall(), version))
    .catch((err) => { state.error = err.message; return null })
  return state.streams
}

export async function ensureAllMappings() {
  if (state.mappings || !org.version) return state.mappings
  const dmos = state.objects.filter((o) => o.kind === 'DMO').map((o) => o.name)
  state.mappings = await sessionCached(sessionKey(org.orgId, 'mappings'), SESSION_TTL, () => loadAllMappings(orgCall(), org.version, dmos, {
    onProgress: (done, total) => { state.mappingsProgress = `${done} of ${total} DMOs` },
  }))
  state.mappingsProgress = ''
  return state.mappings
}

let recordIdsLoading = null
/** Record IDs of DLOs, DMOs and CIs by API name, for links into the org. */
export function ensureRecordIds() {
  if (state.recordIds || !org.version) return Promise.resolve(state.recordIds)
  recordIdsLoading ||= sessionCached(sessionKey(org.orgId, 'recordIds'), SESSION_TTL, () => loadRecordIds(orgCall(), org.version, fetchAllPages))
    .then((ids) => { state.recordIds = ids; return ids })
    .finally(() => { recordIdsLoading = null })
  return recordIdsLoading
}

let usageLoading = null
/** Calculated insights, segments and activations, for "Used by" (Refresh reloads). */
export function ensureUsage({ refresh = false } = {}) {
  if (refresh) state.usage = null
  if (state.usage || !org.version) return Promise.resolve(state.usage)
  usageLoading ||= sessionCached(sessionKey(org.orgId, 'usage'), SESSION_TTL, () => loadUsage(orgCall(), org.version), { refresh })
    .then((u) => { state.usage = u; return u })
    .finally(() => { usageLoading = null })
  return usageLoading
}

/** Forget the cached metadata of an org (Settings). */
export async function forgetCatalog(orgId) {
  await storeRemove(cacheKey(orgId))
  await sessionForget(`dci_s_${orgId}_`)
  if (state.orgId === orgId) Object.assign(state, { orgId: null, objects: [], errors: [], loadedAt: '', streams: null, mappings: null, recordIds: null })
}

watch(() => [org.orgId, org.version], () => { ensureCatalog() })

export function useCatalog() {
  return state
}

/** Identity resolution rulesets for Profiles, kept 5 minutes (their last-run status changes). */
export function cachedRulesets(load, { refresh = false } = {}) {
  return sessionCached(sessionKey(org.orgId, 'rulesets'), 5 * 60 * 1000, load, { refresh })
}
