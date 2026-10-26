// Who the tool runs as in the selected org (feedback #84, #1004), loaded once per org and
// shared by Home and Connection check.
import { reactive, watch } from 'vue'
import { useOrg } from './useOrg.js'
import { sf } from '../lib/api.js'
import { loadUserContext } from '../lib/userContext.js'

const state = reactive({ ctx: null, error: '' })
const cache = new Map() // `${orgId}:${version}` → Promise<context>
let watching = false

export function useUserContext() {
  if (!watching) {
    watching = true
    const org = useOrg()
    watch(() => [org.orgId, org.version], async ([orgId, version]) => {
      state.ctx = null
      state.error = ''
      if (!orgId || !version) return
      const key = `${orgId}:${version}`
      if (!cache.has(key)) {
        const p = loadUserContext((path, opts) => sf(orgId, path, opts), version)
        p.catch(() => cache.delete(key))
        cache.set(key, p)
      }
      try {
        const c = await cache.get(key)
        if (org.orgId === orgId) state.ctx = c
      } catch (err) {
        if (org.orgId === orgId) state.error = err.message
      }
    }, { immediate: true })
  }
  return state
}
