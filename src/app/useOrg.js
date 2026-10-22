// The selected org, shared by every page. Starts from ?org= (set when the toolbar icon
// is clicked on a Salesforce tab), then the last org used, then the first one found.

import { reactive } from 'vue'
import { send, sf, latestVersion } from '../lib/api.js'

const LAST_ORG = 'dci_lastOrg'

const state = reactive({ orgs: [], orgId: null, version: null, loading: false, error: '' })
const versions = new Map()

function readLast() {
  try { return localStorage.getItem(LAST_ORG) } catch { return null }
}

export async function loadOrgs() {
  state.loading = true
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
  if (!orgId) return
  try { localStorage.setItem(LAST_ORG, orgId) } catch { /* private window */ }
  if (!versions.has(orgId)) {
    const res = await sf(orgId, '/services/data/')
    if (!res.ok) { state.error = res.error; return }
    versions.set(orgId, latestVersion(res.data))
  }
  if (state.orgId === orgId) state.version = versions.get(orgId)
}

export function currentOrg() {
  return state.orgs.find((o) => o.orgId === state.orgId) || null
}

export function useOrg() {
  return state
}
