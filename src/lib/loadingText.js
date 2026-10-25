// What is loading (feedback #143): calls in flight named after what they read, plus longer
// jobs that report their own progress (pages of a list, mappings per object). Shown under the
// top bar and in the page's loading line, e.g. "data streams: page 3, 100 so far".

const NAMES = [
  [/\/ssot\/query-sql\/[^/]+\/rows/, 'query rows'],
  [/\/ssot\/query-sql\/[^/?]+(\?|$)/, 'query status'],
  [/\/ssot\/query-sql/, 'query'],
  [/\/ssot\/data-streams/, 'data streams'],
  [/\/ssot\/data-model-object-mappings/, 'mappings'],
  [/\/ssot\/data-lake-objects/, 'data lake objects'],
  [/\/ssot\/data-model-objects/, 'data model objects'],
  [/\/ssot\/metadata\?.*entityType=DataLakeObject/, 'data lake objects'],
  [/\/ssot\/metadata\?.*entityType=DataModelObject/, 'data model objects'],
  [/\/ssot\/metadata\?.*entityType=CalculatedInsight/, 'calculated insights'],
  [/\/ssot\/metadata/, 'metadata'],
  [/\/ssot\/calculated-insights/, 'calculated insights'],
  [/\/ssot\/segments/, 'segments'],
  [/\/ssot\/activation/, 'activations'],
  [/\/ssot\/identity-resolutions/, 'identity rulesets'],
  [/\/ssot\/data-graphs/, 'data graphs'],
  [/\/ssot\/profile/, 'profiles'],
  [/\/ssot\/data-spaces/, 'data spaces'],
  [/\/ssot\/universalIdLookup|\/ssot\/universal-id/, 'lookups'],
  [/\/chatter\/users\/me/, 'your user'],
  [/\/query\/?\?q=|\/query\?/, 'records'],
  [/\/sobjects\//, 'records'],
  [/^\/services\/data\/?$/, 'API versions'],
]

/** A short name for what a REST path reads. */
export function describePath(path = '') {
  const p = String(path)
  for (const [re, name] of NAMES) if (re.test(p)) return name
  const seg = p.split('?')[0].split('/').filter(Boolean).pop() || 'data'
  return seg.replace(/[-_]/g, ' ')
}

/** The page number of a call that pages with offset and limit, or null. */
export function pageOf(path = '') {
  const q = String(path).split('?')[1]
  if (!q) return null
  const params = new URLSearchParams(q)
  const offset = Number(params.get('offset'))
  const limit = Number(params.get('limit') || params.get('rowLimit') || params.get('batchSize'))
  return offset > 0 && limit > 0 ? Math.floor(offset / limit) + 1 : null
}

/**
 * One line from the calls in flight (`paths`) and the running jobs (`tasks`: text each).
 * Jobs come first; calls a job already covers are not named again.
 */
export function loadingText(paths = [], tasks = []) {
  const parts = [...tasks]
  const counts = new Map()
  for (const p of paths) {
    const name = describePath(p)
    if (tasks.some((t) => t.startsWith(name))) continue
    const c = counts.get(name) || { n: 0, page: null }
    c.n++
    c.page = Math.max(c.page || 0, pageOf(p) || 0) || null
    counts.set(name, c)
  }
  for (const [name, c] of counts) parts.push(`${name}${c.page ? ` (page ${c.page})` : c.n > 1 ? ` (${c.n} requests)` : ''}`)
  return parts.join(' · ')
}
