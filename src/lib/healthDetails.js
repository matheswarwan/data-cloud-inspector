// Health row details (feedback #148): the record's own REST detail, reduced to the fields that
// say what happened last (status, error, message, last run or publish, next refresh). Which
// error fields Salesforce fills is not documented; every field whose name looks like one is
// shown, so a failed segment shows whatever reason the API gives.

const BASE = (v) => `/services/data/v${v}/ssot`

/** The REST path with a record's details, or null when there is none for its kind. */
export function detailPath(item, version) {
  const id = encodeURIComponent(item.name || '')
  if (item.kind === 'Segment') return `${BASE(version)}/segments/${id}`
  if (item.kind === 'Data stream') return `${BASE(version)}/data-streams/${id}`
  if (item.kind === 'Calculated insight') return `${BASE(version)}/calculated-insights/${id}`
  if (item.kind === 'Activation' && item.recordId) return `${BASE(version)}/activations/${encodeURIComponent(item.recordId)}`
  return null
}

/** The record inside a detail response (some wrap it in a one-item list). */
export function unwrap(data) {
  if (!data || typeof data !== 'object') return null
  for (const k of ['segments', 'dataStreams', 'calculatedInsights', 'activations', 'records']) if (Array.isArray(data[k])) return data[k][0] || null
  return data
}

const INTERESTING = /error|message|reason|fail|status|lastpublish|lastrun|lastrefresh|publishedend|nextrefresh|nextpublish|lastprocessed|lastadded|publishinterval|refresh(mode|type)|schedule|frequency/i
const ERRORISH = /error|message|reason|fail/i

/** `[{ path, value, error }]`: the status-like fields of a record, nested ones by dotted path. */
export function statusFields(obj, prefix = '', depth = 0, out = []) {
  if (!obj || typeof obj !== 'object' || depth > 3) return out
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object') {
      if (Array.isArray(v)) {
        if (v.length && v.every((x) => x == null || typeof x !== 'object') && INTERESTING.test(k)) out.push({ path, value: v.join(', '), error: ERRORISH.test(k) })
        else v.slice(0, 5).forEach((x, i) => statusFields(x, `${path}[${i}]`, depth + 1, out))
      } else statusFields(v, path, depth + 1, out)
    } else if (INTERESTING.test(k) && v !== '' && v != null) out.push({ path, value: String(v), error: ERRORISH.test(k) })
  }
  return out
}
