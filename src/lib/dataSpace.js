// Data spaces (checked on a live org, API v68.0, 2026-10-22):
// - honour ?dataspace=<name>: ssot/query-sql (POST; the body refuses it), ssot/metadata,
//   ssot/calculated-insights, ssot/segments, ssot/data-graphs, ssot/data-model-object-mappings;
// - ignore it and return every data space: data-model-objects, data-lake-objects, data-streams,
//   identity-resolutions, activations. Their items name the space (dataSpaceName, dataSpace, or
//   dataSpaceInfo / dataLakeObjectInfo.dataSpaceInfo [{ name }]), so they are filtered here.

const HONOURS = /\/ssot\/(query-sql|metadata|calculated-insights|segments|data-graphs(\/[^?]*)?|data-model-object-mappings)$/

/** Adds `dataspace` to a path when the endpoint honours it and the path has none yet. */
export function withDataSpace(path, dataSpace) {
  if (!dataSpace) return path
  const [bare, qs = ''] = String(path).split('?')
  if (!HONOURS.test(bare)) return path
  const params = new URLSearchParams(qs)
  if (params.has('dataspace')) return path
  params.set('dataspace', dataSpace)
  return `${bare}?${params}`
}

/** The data space names an item says it belongs to, or [] when it does not say. */
export function spacesOf(item) {
  if (!item || typeof item !== 'object') return []
  if (item.dataSpaceName) return [item.dataSpaceName]
  if (typeof item.dataSpace === 'string' && item.dataSpace) return [item.dataSpace]
  const info = item.dataSpaceInfo || item.dataLakeObjectInfo?.dataSpaceInfo
  if (Array.isArray(info)) return info.map((d) => d?.name).filter(Boolean)
  return []
}

/** Keeps the items of `dataSpace`; items that do not name a space are kept. */
export function inSpace(items, dataSpace) {
  if (!dataSpace) return items
  return (items || []).filter((i) => {
    const s = spacesOf(i)
    return !s.length || s.includes(dataSpace)
  })
}
