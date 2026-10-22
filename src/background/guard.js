// Read only: the proxy refuses anything that could change data or setup.
// GET and HEAD on Salesforce API paths are fine; POST only for the Data Cloud query
// endpoints, which read. Everything else (PATCH, PUT, DELETE, other POSTs) is refused.

const READ_POSTS = [
  /^\/services\/data\/v\d+\.\d+\/ssot\/query-sql\/?$/,
  /^\/services\/data\/v\d+\.\d+\/ssot\/queryv2\/?$/,
  /^\/services\/data\/v\d+\.\d+\/ssot\/query\/?$/,
]

export function checkRequest(method, path) {
  const m = String(method || 'GET').toUpperCase()
  const p = String(path ?? '')
  if (!p.startsWith('/services/')) return 'Only Salesforce API paths (/services/...) are allowed.'
  if (p.includes('..') || /[\s\\]/.test(p.split('?')[0])) return 'That path is not allowed.'
  if (m === 'GET' || m === 'HEAD') return null
  const bare = p.split('?')[0]
  if (m === 'POST' && READ_POSTS.some((re) => re.test(bare))) return null
  return `Data Cloud Inspector is read only: ${m} ${bare} is not allowed.`
}
