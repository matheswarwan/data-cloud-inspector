// Data Cloud SQL through POST /ssot/query-sql (checked on a live org, 2026-10-22):
// - the POST answers `{ data: [[...]], metadata: [{ name, type, nullable }], returnedRows,
//   status: { queryId, completionStatus, rowCount, ... } }`; `rowLimit` in the body caps
//   the first page (without it the first page stops near 48k rows);
// - more rows: GET /ssot/query-sql/<queryId>/rows?offset=&rowLimit=;
// - status: GET /ssot/query-sql/<queryId>, polled while the query is still running.

const DONE = /^(ResultsProduced|Finished)$/i
const FAILED = /fail|error|cancel/i

export const PAGE_SIZE = 1000

function base(version) {
  return `/services/data/v${version}/ssot/query-sql`
}

function columnsOf(metadata) {
  return (metadata || []).map((m) => ({ name: m.name, type: m.type || '' }))
}

/**
 * Runs `sql` and returns the first page:
 * `{ queryId, columns, rows, total, status, ms }`. Throws with Salesforce's message.
 * `isCancelled()` stops the polling of a long query.
 */
export async function runQuery(call, version, sql, { rowLimit = PAGE_SIZE, isCancelled = () => false, wait = (ms) => new Promise((r) => setTimeout(r, ms)), maxWaitMs = 10 * 60 * 1000 } = {}) {
  const started = Date.now()
  const res = await call(base(version), { method: 'POST', body: { sql, rowLimit } })
  if (!res.ok) throw new Error(cleanError(res.error))
  let status = res.data?.status || {}
  let columns = columnsOf(res.data?.metadata)
  let rows = res.data?.data || []

  if (!DONE.test(status.completionStatus || '') && !rows.length) {
    while (!DONE.test(status.completionStatus || '')) {
      if (FAILED.test(status.completionStatus || '')) throw new Error(`Query ${status.completionStatus}`)
      if (isCancelled()) throw new Error('Cancelled')
      if (Date.now() - started > maxWaitMs) throw new Error('The query is still running after 10 minutes')
      await wait(1000)
      const s = await call(`${base(version)}/${encodeURIComponent(status.queryId)}`)
      if (!s.ok) throw new Error(cleanError(s.error))
      status = s.data || {}
    }
    const page = await fetchRows(call, version, status.queryId, 0, rowLimit)
    rows = page.rows
    if (page.columns.length) columns = page.columns
  }
  return { queryId: status.queryId, columns, rows, total: status.rowCount ?? rows.length, status, ms: Date.now() - started }
}

export async function fetchRows(call, version, queryId, offset, rowLimit = PAGE_SIZE) {
  const res = await call(`${base(version)}/${encodeURIComponent(queryId)}/rows?offset=${offset}&rowLimit=${rowLimit}`)
  if (!res.ok) throw new Error(cleanError(res.error))
  return { rows: res.data?.data || [], columns: columnsOf(res.data?.metadata) }
}

/** Every row from `offset` on, in pages, up to `max`. `onProgress(count)` after each page. */
export async function fetchAllRows(call, version, queryId, { offset = 0, total, max = 500000, pageSize = 10000, onProgress = () => {}, isCancelled = () => false } = {}) {
  const rows = []
  const end = Math.min(total ?? max, max)
  for (let at = offset; at < end; at += pageSize) {
    if (isCancelled()) break
    const page = await fetchRows(call, version, queryId, at, Math.min(pageSize, end - at))
    rows.push(...page.rows)
    onProgress(offset + rows.length)
    if (page.rows.length < Math.min(pageSize, end - at)) break
  }
  return rows
}

// Query errors arrive as JSON inside the message:
// BAD_REQUEST: {"errorMessage":"INVALID_ARGUMENT: ... [TraceId:...]","traceId":...}
export function cleanError(message) {
  const m = String(message ?? '')
  const json = m.indexOf('{')
  if (json >= 0) {
    try {
      const inner = JSON.parse(m.slice(json))
      if (inner.errorMessage) return inner.errorMessage.replace(/\s*\[TraceId:[^\]]*\]\s*$/, '')
    } catch { /* not JSON */ }
  }
  return m
}

function cell(v) {
  if (v == null) return ''
  return typeof v === 'object' ? JSON.stringify(v) : String(v)
}

export function toCsv(columns, rows) {
  const esc = (v) => {
    const s = cell(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [columns.map((c) => esc(c.name)).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\r\n')
}

/** The SQL, column types and the first rows as Markdown, for pasting into an AI chat. */
export function resultMarkdown(sql, columns, rows, { total, max = 50 } = {}) {
  const esc = (v) => cell(v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
  const shown = rows.slice(0, max)
  return [
    '```sql', sql.trim(), '```', '',
    `${total ?? rows.length} rows${shown.length < (total ?? rows.length) ? `, first ${shown.length} shown` : ''}.`, '',
    `| ${columns.map((c) => `${c.name} (${c.type})`).join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...shown.map((r) => `| ${r.map(esc).join(' | ')} |`),
  ].join('\n')
}
