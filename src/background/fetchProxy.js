// Every Salesforce call goes through here (message SF_FETCH), so the session ID never
// reaches the app page. The sid works as a Bearer token on the org's my.salesforce.com
// host; host_permissions let the service worker call it without CORS trouble.

import { checkRequest } from './guard.js'
import { sessionFor } from './sessions.js'

export const CLIENT_NAME = 'DataCloudInspector'

/** Salesforce error bodies are `[{ errorCode, message }]`; anything else is shortened. */
export function errorMessage(status, data, text) {
  if (Array.isArray(data) && data.length && data[0]?.message) {
    return data.map((e) => (e.errorCode ? `${e.errorCode}: ${e.message}` : e.message)).join('\n')
  }
  if (data && typeof data === 'object' && (data.message || data.error)) {
    return String(data.message || data.error_description || data.error)
  }
  const t = String(text ?? '')
  const title = t.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim()
  return title || t.substring(0, 300) || `HTTP ${status}`
}

/**
 * `{ ok, status, ms, data }` or `{ ok: false, status, ms, error, data }`.
 * status 0 means the request never got a response.
 */
export async function sfFetch({ orgId, path, method = 'GET', body }, deps = {}) {
  const fetchFn = deps.fetch || fetch
  const getSession = deps.sessionFor || sessionFor
  const refused = checkRequest(method, path)
  if (refused) return { ok: false, status: 0, ms: 0, error: refused, code: 'READ_ONLY' }
  const session = await getSession(orgId)
  if (!session) return { ok: false, status: 0, ms: 0, error: 'No Salesforce session for this org. Log in to it in this browser, then try again.', code: 'NO_SESSION' }

  const headers = {
    Authorization: `Bearer ${session.sid}`,
    Accept: 'application/json',
    'Sforce-Call-Options': `client=${CLIENT_NAME}`,
  }
  const opts = { method: method.toUpperCase(), headers, credentials: 'omit', cache: 'no-store' }
  if (body != null) {
    headers['Content-Type'] = 'application/json'
    opts.body = typeof body === 'string' ? body : JSON.stringify(body)
  }

  const started = Date.now()
  let res
  try {
    res = await fetchFn(`https://${session.host}${path}`, opts)
  } catch (err) {
    return { ok: false, status: 0, ms: Date.now() - started, error: `Network error: ${err.message}` }
  }
  const text = await res.text()
  const ms = Date.now() - started
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = null }
  if (res.ok) return { ok: true, status: res.status, ms, data: data ?? text }
  return { ok: false, status: res.status, ms, error: errorMessage(res.status, data, text), data }
}
