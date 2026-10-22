import { safePath } from './feedbackMeta.js'

// The app page talks to Salesforce only through the service worker (SF_FETCH).

export function send(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (res) => {
        if (chrome.runtime.lastError) resolve({ ok: false, status: 0, error: chrome.runtime.lastError.message })
        else resolve(res)
      })
    } catch (err) {
      resolve({ ok: false, status: 0, error: err.message })
    }
  })
}

// The last API calls (newest first) for feedback: method, path without query values,
// status and time. Never bodies or results.
const CALL_LOG_MAX = 20
const callLog = []

export function recentCalls() {
  return callLog.slice()
}

export async function sf(orgId, path, { method = 'GET', body } = {}) {
  const res = await send({ type: 'SF_FETCH', orgId, path, method, body })
  callLog.unshift({
    method,
    path: safePath(path),
    status: res?.status || 0,
    ms: res?.ms ?? null,
    error: res?.ok ? null : String(res?.error || '').slice(0, 200),
  })
  callLog.length = Math.min(callLog.length, CALL_LOG_MAX)
  return res
}

/** The highest version from GET /services/data/ (`[{ version: "65.0", ... }]`). */
export function latestVersion(list) {
  const versions = (Array.isArray(list) ? list : [])
    .map((v) => String(v?.version ?? ''))
    .filter((v) => /^\d+\.\d+$/.test(v))
  versions.sort((a, b) => parseFloat(a) - parseFloat(b))
  return versions.at(-1) || null
}
