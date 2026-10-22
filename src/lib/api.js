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

export function sf(orgId, path, { method = 'GET', body } = {}) {
  return send({ type: 'SF_FETCH', orgId, path, method, body })
}

/** The highest version from GET /services/data/ (`[{ version: "65.0", ... }]`). */
export function latestVersion(list) {
  const versions = (Array.isArray(list) ? list : [])
    .map((v) => String(v?.version ?? ''))
    .filter((v) => /^\d+\.\d+$/.test(v))
  versions.sort((a, b) => parseFloat(a) - parseFloat(b))
  return versions.at(-1) || null
}
