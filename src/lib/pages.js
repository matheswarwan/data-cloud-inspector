// Data Cloud list endpoints page with `nextPageUrl`. Its offsets are not always regular
// (data streams went 0, 11), so the link is followed as given rather than computed.

export async function fetchAllPages(call, firstPath, listKey, { maxPages = 50 } = {}) {
  const items = []
  let path = firstPath
  for (let i = 0; path && i < maxPages; i++) {
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
}
