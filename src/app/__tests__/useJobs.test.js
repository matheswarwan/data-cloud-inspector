import { useJob, startJob, markSeen, jobBadge } from '../useJobs.js'

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('background jobs', () => {
  beforeEach(() => {
    const store = {}
    globalThis.chrome = { storage: { session: { get: async (k) => ({ [k]: store[k] }), set: async (o) => Object.assign(store, o) } } }
  })
  afterEach(() => { delete globalThis.chrome })

  it('runs once at a time, reports progress, keeps the result and the badge', async () => {
    let release
    const run = (progress) => new Promise((res) => { progress('half way'); release = () => res({ ok: 1 }) })
    const job = startJob('health:x', run)
    expect(job.status).toBe('running')
    await flush()
    expect(job.progress).toBe('half way')
    expect(jobBadge('health:')).toBe('running')
    expect(startJob('health:x', () => Promise.resolve('other'))).toBe(job) // still the first run
    release()
    await flush(); await flush()
    expect(job.status).toBe('done')
    expect(job.result).toEqual({ ok: 1 })
    expect(jobBadge('health:')).toBe('new')
    markSeen('health:x')
    expect(jobBadge('health:')).toBe('')
  })
  it('records failures', async () => {
    const job = startJob('compare', () => Promise.reject(new Error('boom')))
    await flush(); await flush()
    expect(job).toMatchObject({ status: 'failed', error: 'boom' })
    expect(useJob('compare')).toBe(job)
  })
})
