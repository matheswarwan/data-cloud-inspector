// Preload when connected (feedback #147): once per org and data space in each app tab, read
// the metadata, streams, mappings, record IDs, usage and data graphs one after another, then
// run the Health check if its stored result is missing or over an hour old. Feedback #1002:
// each step's state is kept in `preloadState` so the connection menu can show what is being
// loaded, and Load everything / Refresh everything start it by hand.
import { reactive, watch } from 'vue'
import { useOrg } from './useOrg.js'
import { ensureCatalog, ensureStreams, ensureAllMappings, ensureRecordIds, ensureUsage, ensureDataGraphs, useCatalog, orgCall } from './useCatalog.js'
import { useJob, startJob } from './useJobs.js'
import { loadHealth } from '../lib/health.js'
import { preloadOn, stale, PRELOAD_STEPS, plural } from '../lib/preload.js'

const done = new Set()
const catalog = useCatalog()
export const preloadState = reactive({ key: '', running: false, steps: PRELOAD_STEPS.map((s) => ({ ...s, status: 'pending', detail: '', error: '' })) })

export function healthJobId(orgId, dataSpace) {
  return `health:${orgId}:${dataSpace || 'default'}`
}

const keyOf = (org) => `${org.orgId}|${org.dataSpace || 'default'}`
const step = (id) => preloadState.steps.find((s) => s.id === id)

// What each step runs and how it describes the result. `refresh` reads again from the org.
const RUN = {
  catalog: async (refresh) => {
    await ensureCatalog({ refresh })
    if (catalog.error && !catalog.objects.length) throw new Error(catalog.error)
    return plural(catalog.objects.length, 'object')
  },
  streams: async () => {
    const list = await ensureStreams()
    if (!list) throw new Error(catalog.error || 'Could not read the data streams')
    return plural(list.length, 'stream')
  },
  mappings: async () => {
    const m = await ensureAllMappings()
    return m ? plural(m.length, 'mapping') : 'no data model objects'
  },
  recordIds: async () => {
    const ids = await ensureRecordIds()
    return ids ? plural(Object.keys(ids).length, 'record link') : ''
  },
  usage: async (refresh) => {
    const u = await ensureUsage({ refresh })
    return u ? `${plural(u.insights?.length || 0, 'insight')}, ${plural(u.segments?.length || 0, 'segment')}, ${plural(u.activations?.length || 0, 'activation')}` : ''
  },
  dataGraphs: async (refresh) => plural((await ensureDataGraphs({ refresh })).length, 'data graph'),
}

async function runHealth(org, force) {
  const job = useJob(healthJobId(org.orgId, org.dataSpace))
  await new Promise((r) => setTimeout(r, 300)) // let a stored result load first
  if (job.status !== 'running' && (force || !job.result || stale(job.finishedAt))) {
    const call = orgCall()
    const version = org.version
    startJob(job.id, (progress) => loadHealth(call, version, { onProgress: progress }))
  }
  const s = step('health')
  while (job.status === 'running') {
    s.detail = job.progress || 'checking'
    await new Promise((r) => setTimeout(r, 400))
  }
  if (job.status === 'failed') throw new Error(job.error)
  const problems = (job.result || []).flatMap((sec) => sec.items).filter((i) => i.level === 'fail' || i.level === 'warn').length
  return problems ? `${plural(problems, 'problem')} found` : 'no problems'
}

/** Loads every section for the selected org and data space; `refresh` reads everything again. */
export async function loadEverything({ refresh = false } = {}) {
  const org = useOrg()
  if (!org.orgId || !org.version || preloadState.running) return
  const key = keyOf(org)
  done.add(key)
  Object.assign(preloadState, { key, running: true })
  for (const s of preloadState.steps) Object.assign(s, { status: 'pending', detail: '', error: '' })
  const still = () => keyOf(org) === key
  try {
    for (const s of preloadState.steps) {
      if (!still()) return
      s.status = 'running'
      const started = Date.now()
      try {
        s.detail = s.id === 'health' ? await runHealth(org, refresh) : await RUN[s.id](refresh)
        s.status = 'done'
      } catch (err) {
        s.status = 'failed'
        s.error = err?.message || String(err)
      }
      s.ms = Date.now() - started
    }
  } finally {
    preloadState.running = false
  }
}

export function usePreload() {
  const org = useOrg()
  watch(() => [org.orgId, org.version, org.dataSpace, org.problem], () => {
    if (preloadState.key && preloadState.key !== keyOf(org) && !preloadState.running) {
      Object.assign(preloadState, { key: '' })
      for (const s of preloadState.steps) Object.assign(s, { status: 'pending', detail: '', error: '' })
    }
    if (org.orgId && org.version && !org.problem && preloadOn() && !done.has(keyOf(org))) setTimeout(() => { if (!done.has(keyOf(org))) loadEverything() }, 1500)
  }, { immediate: true })
}
