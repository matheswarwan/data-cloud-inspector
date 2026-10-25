// Preload when connected (feedback #147): once per org and data space in each app tab, read
// the metadata, streams, mappings, record IDs and usage one after another, then run the
// Health check if its stored result is missing or over an hour old. Errors stay quiet: the
// pages report them when opened.
import { watch } from 'vue'
import { useOrg } from './useOrg.js'
import { ensureCatalog, ensureStreams, ensureAllMappings, ensureRecordIds, ensureUsage, orgCall } from './useCatalog.js'
import { useJob, startJob } from './useJobs.js'
import { loadHealth } from '../lib/health.js'
import { preloadOn, stale } from '../lib/preload.js'

const done = new Set()

export function healthJobId(orgId, dataSpace) {
  return `health:${orgId}:${dataSpace || 'default'}`
}

async function preload(org) {
  const key = `${org.orgId}|${org.dataSpace || 'default'}`
  if (done.has(key)) return
  done.add(key)
  const still = () => `${org.orgId}|${org.dataSpace || 'default'}` === key
  for (const step of [ensureCatalog, ensureStreams, ensureAllMappings, ensureRecordIds, ensureUsage]) {
    if (!still()) return
    await Promise.resolve().then(() => step()).catch(() => {})
  }
  if (!still()) return
  const job = useJob(healthJobId(org.orgId, org.dataSpace))
  await new Promise((r) => setTimeout(r, 300)) // let a stored result load first
  if (job.status !== 'running' && (!job.result || stale(job.finishedAt))) {
    const call = orgCall()
    const version = org.version
    startJob(job.id, (progress) => loadHealth(call, version, { onProgress: progress }))
  }
}

export function usePreload() {
  const org = useOrg()
  watch(() => [org.orgId, org.version, org.dataSpace, org.problem], () => {
    if (org.orgId && org.version && !org.problem && preloadOn()) setTimeout(() => preload(org), 1500)
  }, { immediate: true })
}
