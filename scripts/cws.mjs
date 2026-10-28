// Chrome Web Store API v2 client for the publish workflow (no dependencies).
//   node scripts/cws.mjs upload <zip>   upload a package (waits while UPLOAD_IN_PROGRESS)
//   node scripts/cws.mjs publish        submit the uploaded package for review
//   node scripts/cws.mjs status         print the item's status
// Env: CWS_TOKEN (OAuth access token, scope https://www.googleapis.com/auth/chromewebstore; in CI
// from Workload Identity Federation for a service account linked in the Developer Dashboard),
// CWS_PUBLISHER_ID, CWS_EXTENSION_ID. Never prints the token.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const HOST = 'https://chromewebstore.googleapis.com'

export function itemPath({ publisherId, extensionId }) {
  if (!/^[\w.-]+$/.test(publisherId || '')) throw new Error('CWS_PUBLISHER_ID is missing or malformed')
  if (!/^[a-p]{32}$/.test(extensionId || '')) throw new Error('CWS_EXTENSION_ID must be a 32-letter extension ID')
  return `publishers/${publisherId}/items/${extensionId}`
}

async function call(url, { token, method = 'GET', body, type, fetchFn = fetch }) {
  const res = await fetchFn(url, { method, headers: { Authorization: `Bearer ${token}`, ...(type ? { 'Content-Type': type } : {}) }, body })
  const text = await res.text()
  let data = null
  try { data = JSON.parse(text) } catch { data = { raw: text.slice(0, 500) } }
  if (!res.ok) throw new Error(`${method} ${url.replace(HOST, '')}: HTTP ${res.status} ${JSON.stringify(data).slice(0, 800)}`)
  return data
}

export async function upload(zip, opts) {
  const path = itemPath(opts)
  let r = await call(`${HOST}/upload/v2/${path}:upload`, { ...opts, method: 'POST', body: readFileSync(zip), type: 'application/zip' })
  for (let i = 0; r.uploadState === 'UPLOAD_IN_PROGRESS' && i < 30; i++) {
    await new Promise((ok) => setTimeout(ok, opts.pollMs ?? 10000))
    r = await call(`${HOST}/v2/${path}:fetchStatus`, opts)
    r = { ...r, uploadState: r.lastAsyncUploadState || r.uploadState }
  }
  if (/FAIL/i.test(r.uploadState || '')) throw new Error(`Upload failed: ${JSON.stringify(r).slice(0, 800)}`)
  return r
}

export const publish = (opts) => call(`${HOST}/v2/${itemPath(opts)}:publish`, { ...opts, method: 'POST', body: '{}', type: 'application/json' })
export const status = (opts) => call(`${HOST}/v2/${itemPath(opts)}:fetchStatus`, opts)

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, zip] = process.argv.slice(2)
  const opts = { token: process.env.CWS_TOKEN, publisherId: process.env.CWS_PUBLISHER_ID, extensionId: process.env.CWS_EXTENSION_ID }
  if (!opts.token) { console.error('CWS_TOKEN is not set'); process.exit(1) }
  const run = { upload: () => upload(zip, opts), publish: () => publish(opts), status: () => status(opts) }[cmd]
  if (!run) { console.error('usage: node scripts/cws.mjs upload <zip> | publish | status'); process.exit(1) }
  run().then((r) => console.log(JSON.stringify(r, null, 2))).catch((e) => { console.error(e.message); process.exit(1) })
}
