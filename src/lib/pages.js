// Data Cloud list endpoints page with `nextPageUrl`. Its offsets are not always regular
// (data streams went 0, 11), so the link is followed as given rather than computed.
// While it pages, the top bar says so: "data streams: page 3, 100 so far" (feedback #143).

import { setTask, endTask } from './api.js'
import { describePath } from './loadingText.js'

let seq = 0

export async function fetchAllPages(call, firstPath, listKey, { maxPages = 50 } = {}) {
  const items = []
  const key = `pages${++seq}`
  const name = describePath(firstPath)
  try {
    let path = firstPath
    for (let i = 0; path && i < maxPages; i++) {
      if (i) setTask(key, `${name}: page ${i + 1}, ${items.length.toLocaleString()} so far`)
      const res = await call(path)
      if (!res.ok) {
        if (!items.length) throw new Error(res.error || `HTTP ${res.status}`)
        break
      }
      items.push(...(res.data?.[listKey] || []))
      const next = res.data?.nextPageUrl
      path = next && next !== path ? next : null
    }
    return items
  } finally {
    endTask(key)
  }
}
