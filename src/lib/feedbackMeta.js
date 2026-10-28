// Technical details sent with feedback when "Include technical details" is ticked.
// Nothing from Data Cloud records: no SQL, no query strings, no field values.

export function collectFeedbackMetadata({ route, orgHost, apiVersion, apiCalls = [], now = new Date() } = {}) {
  const nav = typeof navigator !== 'undefined' ? navigator : {}
  const win = typeof window !== 'undefined' ? window : {}
  let version = 'unknown'
  try { version = chrome.runtime.getManifest().version } catch { /* not in an extension */ }
  const errors = apiCalls.filter((c) => c.error)
  return {
    appVersion: version,
    page: route || null,
    org: orgHost || null,
    apiVersion: apiVersion || null,
    browser: nav.userAgent || null,
    language: nav.language || null,
    window: win.innerWidth ? `${win.innerWidth}x${win.innerHeight}` : null,
    time: now.toISOString(),
    recentApiErrors: errors.slice(0, 5),
    recentApiCalls: apiCalls.slice(0, 20),
  }
}

/** The details as "label: value" lines for the preview in the form. */
export function metadataLines(meta) {
  const lines = []
  for (const [k, v] of Object.entries(meta || {})) {
    if (k === 'recentApiErrors') {
      if (!v?.length) lines.push(['Recent API errors', 'none'])
      else v.forEach((e, i) => lines.push([`API error ${i + 1}`, `${e.method} ${e.path} (${e.status || 'no response'}): ${e.error}`]))
    } else if (k === 'recentApiCalls') {
      if (!v?.length) lines.push(['Recent API calls', 'none'])
      else v.forEach((c, i) => lines.push([`API call ${i + 1}`, `${c.method} ${c.path} (${c.status || 'no response'}, ${c.ms} ms)`]))
    } else if (v != null && v !== '') {
      lines.push([k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()), String(v)])
    }
  }
  return lines
}

/** The page path without record IDs: /profile/s/003... becomes /profile/s/:id. */
export function pagePath(path) {
  return String(path || '').replace(/^(\/profile\/[us])\/.+$/, '$1/:id')
}

/** An API path with its query string reduced to parameter names (a SOQL query there is data). */
export function safePath(path) {
  const [p, qs] = String(path || '').split('?')
  if (!qs) return p
  return `${p}?${qs.split('&').map((kv) => kv.split('=')[0]).join('&')}`
}

/** The feedback as plain text for an email: kind, message, details, then the technical details. */
export function feedbackText({ kind, message, details, meta }) {
  const parts = [`Kind: ${kind}`, '', String(message || '').trim()]
  if (String(details || '').trim()) parts.push('', 'More details:', String(details).trim())
  if (meta) parts.push('', 'Technical details:', ...metadataLines(meta).map(([k, v]) => `${k}: ${v}`))
  return parts.join('\n')
}

/** A mailto: link. Mail apps cut long links, so the body is shortened (the full text is copied). */
export function feedbackMailto(to, subject, body, max = 1800) {
  const short = body.length > max ? `${body.slice(0, max)}\n\n[Shortened: paste the full text from the clipboard.]` : body
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(short)}`
}
