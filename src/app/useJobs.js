// Background jobs for slow pages (Health, Compare): a job keeps running while you use other
// pages, and its result waits for you. Finished results are also kept in
// chrome.storage.session, so they survive closing and reopening the inspector until the
// browser closes. The nav shows a running job and an unseen result.

import { reactive } from 'vue'

const jobs = reactive({}) // id -> job
const restored = new Set()

function blank(id) {
  return { id, status: 'idle', startedAt: null, finishedAt: null, result: null, error: '', progress: '', seen: true, params: null }
}

const storeKey = (id) => `dci_job_${id}`

/** The job, created empty if needed; a stored finished result is restored once. */
export function useJob(id) {
  if (!jobs[id]) jobs[id] = blank(id)
  if (!restored.has(id)) {
    restored.add(id)
    chrome.storage?.session?.get?.(storeKey(id)).then((r) => {
      const saved = r?.[storeKey(id)]
      if (saved && jobs[id].status === 'idle') Object.assign(jobs[id], saved, { seen: true })
    }).catch(() => {})
  }
  return jobs[id]
}

/**
 * Starts `run(progress)` as job `id` unless it is already running. `progress(text)` updates
 * what the page shows. Returns the job.
 */
export function startJob(id, run, { params = null } = {}) {
  const job = useJob(id)
  if (job.status === 'running') return job
  Object.assign(job, { status: 'running', startedAt: new Date().toISOString(), finishedAt: null, error: '', progress: '', params, seen: false })
  Promise.resolve()
    .then(() => run((text) => { job.progress = text }))
    .then((result) => {
      Object.assign(job, { status: 'done', result, finishedAt: new Date().toISOString(), progress: '' })
    }, (err) => {
      Object.assign(job, { status: 'failed', error: err.message || String(err), finishedAt: new Date().toISOString(), progress: '' })
    })
    .then(() => {
      const { status, startedAt, finishedAt, result, error, params: p } = job
      chrome.storage?.session?.set?.({ [storeKey(id)]: JSON.parse(JSON.stringify({ status, startedAt, finishedAt, result, error, params: p })) }).catch(() => {})
    })
  return job
}

export function markSeen(id) {
  if (jobs[id]) jobs[id].seen = true
}

/** For the nav: 'running', 'new' (finished, not looked at yet) or '' for jobs whose id starts with `prefix`. */
export function jobBadge(prefix) {
  const mine = Object.values(jobs).filter((j) => j.id.startsWith(prefix))
  if (mine.some((j) => j.status === 'running')) return 'running'
  if (mine.some((j) => (j.status === 'done' || j.status === 'failed') && !j.seen)) return 'new'
  return ''
}

