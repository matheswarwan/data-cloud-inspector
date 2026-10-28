// The badge colour for a status word (design pages): green for good, red for failed, amber for
// waiting or warning, blue for schedules and running, grey otherwise.
export function badgeClass(text) {
  const t = String(text || '').toLowerCase()
  if (!t || t === '—') return 'dci-badge'
  if (/(fail|error|invalid|disabled|inactive|deleted)/.test(t)) return 'dci-badge dci-badge-red'
  if (/(warn|pending|draft|not published|paused|stopped|never|partial)/.test(t)) return 'dci-badge dci-badge-amber'
  if (/(running|in progress|processing|every |hour|day|week|month)/.test(t)) return 'dci-badge dci-badge-blue'
  if (/(active|success|in use|published|ok|ready|complete|enabled)/.test(t)) return 'dci-badge dci-badge-green'
  return 'dci-badge'
}
