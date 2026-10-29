// The selected org's Data Cloud objects, kept in chrome.storage.local per org (the
// metadata calls take a few seconds) until Refresh. Streams and mappings stay in memory.

import { reactive, watch } from 'vue'
import { sf, setTask, endTask } from '../lib/api.js'
import { loadCatalog } from '../lib/catalog.js'
import { loadStreams, loadAllMappings } from '../lib/lineage.js'
import { loadRecordIds } from '../lib/links.js'
import { loadUsage } from '../lib/usage.js'
import { fetchAllPages } from '../lib/pages.js'
import { withDataSpace } from '../lib/dataSpace.js'
import { cacheGet, cacheSet, orgCached, forgetCached } from '../lib/store.js'
import { metadataTtl } from '../lib/cacheAge.js'
import { loadDataGraphs } from '../lib/dataGraphs.js'
import { ensureSegments } from './useSegments.js'
import { useOrg, currentDataSpaceId } from './useOrg.js'

const org = useOrg()
const state = reactive({
  key: null,
  orgId: null, objects: [], errors: [], loadedAt: '', loading: false, error: '',
  streams: null, mappings: null, mappingsProgress: '', recordIds: null, usage: null,
})

/**
 * The call function for the selected org and data space: endpoints that honour `dataspace`
 * get it added; `call.dataSpace` lets the libraries filter lists that ignore it.
 */
export function orgCall() {
  const { orgId, dataSpace } = org
  const call = (path, opts) => sf(orgId, withDataSpace(path, dataSpace), opts)
  call.dataSpace = dataSpace
  call.dataSpaceId = currentDataSpaceId()
  return call
}

/** Data graphs with their definitions, kept 10 minutes in session storage. */
export function ensureDataGraphs({ refresh = false } = {}) {
  if (!org.orgId || !org.version) return Promise.resolve([])
  return orgCached(sessionKey(org.orgId, 'dataGraphs'), metadataTtl(), () => loadDataGraphs(orgCall(), org.version), { refresh })
}

const cacheKey = (orgId) => `dci_catalog_${orgId}${org.dataSpace && org.dataSpace !== 'default' ? `_${org.dataSpace}` : ''}`
// Streams, mappings, record IDs and usage: kept in this browser (feedback #1007) and shown at
// once, read again in the background once older than Settings > Keep org details (feedback
// #1043, a day by default); Refresh on the Objects page reloads them.
const sessionKey = (orgId, what) => `dci_s_${orgId}_${org.dataSpace || 'default'}_${what}`

// One catalog load at a time per org and data space: a second caller waits for the load
// that is already running instead of returning before the objects are there.
let inflight = null
let inflightKey = ''
export function ensureCatalog(opts = {}) {
  const key = `${org.orgId}|${org.dataSpace}`
  if (!opts.refresh && inflight && inflightKey === key) return inflight
  inflightKey = key
  const p = loadCatalogState(opts).finally(() => { if (inflight === p) inflight = null })
  inflight = p
  return p
}

async function loadCatalogState({ refresh = false } = {}) {
  const { orgId, version } = org
  if (!orgId || !version) return
  const key = `${orgId}|${org.dataSpace}`
  if (!refresh && state.key === key && state.objects.length) return
  if (state.key !== key) Object.assign(state, { objects: [], errors: [], loadedAt: '', streams: null, mappings: null, recordIds: null, usage: null })
  state.orgId = orgId
  state.key = key
  state.error = ''
  if (refresh) await forgetCached(`dci_s_${orgId}_`)
  if (!refresh) {
    const cached = await cacheGet(cacheKey(orgId))
    if (cached?.objects?.length) {
      Object.assign(state, cached)
      return
    }
  }
  state.loading = true
  try {
    const catalog = await loadCatalog(orgCall(), version)
    if (state.key !== key) return
    Object.assign(state, catalog, { streams: null, mappings: null, recordIds: null, usage: null })
    if (catalog.objects.length) await cacheSet(cacheKey(orgId), catalog)
  } catch (err) {
    state.error = err.message
  } finally {
    state.loading = false
  }
}

export async function ensureStreams() {
  if (state.streams || !org.version) return state.streams
  const { orgId, version } = org
  const key = state.key
  state.streams = await orgCached(sessionKey(orgId, 'streams'), metadataTtl(), () => loadStreams(orgCall(), version), { onUpdate: (v) => { if (state.key === key) state.streams = v } })
    .catch((err) => { state.error = err.message; return null })
  return state.streams
}

export async function ensureAllMappings() {
  if (state.mappings || !org.version) return state.mappings
  await ensureCatalog()
  if (state.mappings) return state.mappings
  const dmos = state.objects.filter((o) => o.kind === 'DMO').map((o) => o.name)
  if (!dmos.length) return null // no objects yet: never cache an empty list
  const key = state.key
  state.mappings = await orgCached(sessionKey(org.orgId, 'mappings'), metadataTtl(), () => loadAllMappings(orgCall(), org.version, dmos, {
    onProgress: (done, total) => { state.mappingsProgress = `${done} of ${total} DMOs`; setTask('mappings', `mappings: ${done} of ${total} data model objects`) },
  }).finally(() => { endTask('mappings'); state.mappingsProgress = '' }), { onUpdate: (v) => { if (state.key === key) state.mappings = v } })
  state.mappingsProgress = ''
  return state.mappings
}

let recordIdsLoading = null
/** Record IDs of DLOs, DMOs and CIs by API name, for links into the org. */
export function ensureRecordIds() {
  if (state.recordIds || !org.version) return Promise.resolve(state.recordIds)
  const key = state.key
  recordIdsLoading ||= orgCached(sessionKey(org.orgId, 'recordIds'), metadataTtl(), () => loadRecordIds(orgCall(), org.version, fetchAllPages), { onUpdate: (v) => { if (state.key === key) state.recordIds = v } })
    .then((ids) => { state.recordIds = ids; return ids })
    .finally(() => { recordIdsLoading = null })
  return recordIdsLoading
}

let usageLoading = null
/** Calculated insights, segments and activations, for "Used by" (Refresh reloads). */
export function ensureUsage({ refresh = false } = {}) {
  if (refresh) state.usage = null
  if (state.usage || !org.version) return Promise.resolve(state.usage)
  const key = state.key
  usageLoading ||= orgCached(sessionKey(org.orgId, 'usage'), metadataTtl(), () => loadUsage(orgCall(), org.version, { segments: () => ensureSegments({ refresh }) }), { refresh, onUpdate: (v) => { if (state.key === key) state.usage = v } })
    .then((u) => { state.usage = u; return u })
    .finally(() => { usageLoading = null })
  return usageLoading
}

/** Forget the cached metadata of an org (Settings). */
export async function forgetCatalog(orgId) {
  await forgetCached(cacheKey(orgId))
  await forgetCached(`dci_s_${orgId}_`)
  if (state.orgId === orgId) Object.assign(state, { key: null, orgId: null, objects: [], errors: [], loadedAt: '', streams: null, mappings: null, recordIds: null })
}

watch(() => [org.orgId, org.version, org.dataSpace], () => { ensureCatalog() })

export function useCatalog() {
  return state
}

/** Identity resolution rulesets for Profiles, kept 5 minutes (their last-run status changes). */
export function cachedRulesets(load, { refresh = false } = {}) {
  return orgCached(sessionKey(org.orgId, 'rulesets'), 5 * 60 * 1000, load, { refresh })
}

/** Drop what is in memory (after Settings deleted caches); it loads again when needed. */
export function resetCatalog() {
  Object.assign(state, { key: null, objects: [], errors: [], loadedAt: '', streams: null, mappings: null, recordIds: null, usage: null })
}
