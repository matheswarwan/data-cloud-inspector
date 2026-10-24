// The selected org, shared by every page. Starts from ?org= (set when the toolbar icon
// is clicked on a Salesforce tab), then the last org used, then the first one found.

import { reactive } from 'vue'
import { send, sf, latestVersion } from '../lib/api.js'
import { sessionProblem, dataCloudProblem } from '../lib/orgStatus.js'
import { storeGet, storeSet } from '../lib/store.js'
import { rememberOrg, renameOrg, forgetOrgs } from '../lib/savedOrgs.js'

const LAST_ORG = 'dci_lastOrg'

const state = reactive({ orgs: [], orgId: null, version: null, loading: false, error: '', user: null, problem: null, dataSpaces: [], dataSpace: null, saved: {} })
const versions = new Map()

function readLast() {
  try { return localStorage.getItem(LAST_ORG) } catch { return null }
}

// Orgs connected before (feedback #109): Home lists them when a session has expired.
const SAVED = 'dci_savedOrgs'
export async function loadSavedOrgs() {
  state.saved = (await storeGet(SAVED, {})) || {}
}
async function writeSaved(next) {
  state.saved = next
  await storeSet(SAVED, JSON.parse(JSON.stringify(next)))
}
export const renameSavedOrg = (orgId, name) => writeSaved(renameOrg(state.saved, orgId, name))
export const forgetSavedOrgs = (orgIds) => writeSaved(forgetOrgs(state.saved, orgIds))

export async function loadOrgs() {
  state.loading = true
  await loadSavedOrgs()
  state.error = ''
  const res = await send({ type: 'LIST_ORGS' })
  state.orgs = res?.orgs || []
  const wanted = new URLSearchParams(location.search).get('org') || state.orgId || readLast()
  const pick = state.orgs.find((o) => o.orgId === wanted) || state.orgs[0]
  state.loading = false
  await selectOrg(pick?.orgId || null)
}

export async function selectOrg(orgId) {
  state.orgId = orgId
  state.version = null
  state.user = null
  state.problem = null
  state.error = ''
  state.dataSpaces = []
  state.dataSpace = null
  if (!orgId) return
  try { localStorage.setItem(LAST_ORG, orgId) } catch { /* private window */ }
  if (!versions.has(orgId)) {
    const res = await sf(orgId, '/services/data/')
    if (!res.ok) { state.error = res.error; return }
    versions.set(orgId, latestVersion(res.data))
  }
  const v = versions.get(orgId)
  const [me, spaces] = await Promise.all([
    sf(orgId, `/services/data/v${v}/chatter/users/me`),
    sf(orgId, `/services/data/v${v}/ssot/data-spaces`),
  ])
  if (state.orgId !== orgId) return
  // The data space is chosen before the version is published, so pages load in it.
  state.dataSpaces = (spaces.ok ? spaces.data?.dataSpaces || [] : []).map((d) => ({ id: d.id || '', name: d.name, label: d.label || d.name, status: d.status || '' }))
  const saved = readSpace(orgId)
  state.dataSpace = state.dataSpaces.find((d) => d.name === saved)?.name || state.dataSpaces.find((d) => d.name === 'default')?.name || state.dataSpaces[0]?.name || null
  state.version = v
  if (me.ok) state.user = { id: me.data?.id, name: me.data?.name, username: me.data?.username }
  state.problem = sessionProblem(me) || dataCloudProblem(spaces)
  const host = state.orgs.find((o) => o.orgId === orgId)?.host
  if (me.ok && !state.problem && host) writeSaved(rememberOrg(state.saved, { orgId, host, username: state.user?.username }))
}

/** Check the session and Data Cloud again (after logging in with OAuth). */
export function recheckOrg() {
  return selectOrg(state.orgId)
}

const SPACE = (orgId) => `dci_dataSpace_${orgId}`
function readSpace(orgId) {
  try { return localStorage.getItem(SPACE(orgId)) } catch { return null }
}

/** Switch data space; pages watch `dataSpace` and load again. */
export function selectDataSpace(name) {
  if (!state.dataSpaces.some((d) => d.name === name) || name === state.dataSpace) return
  try { localStorage.setItem(SPACE(state.orgId), name) } catch { /* private window */ }
  state.dataSpace = name
}

/** The selected data space's record ID (Personalization setup records use it). */
export function currentDataSpaceId() {
  return state.dataSpaces.find((d) => d.name === state.dataSpace)?.id || ''
}

export function currentOrg() {
  return state.orgs.find((o) => o.orgId === state.orgId) || null
}

export function useOrg() {
  return state
}
