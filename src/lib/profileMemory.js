// Profiles page memory (feedback #1037): the last search with its results and the profiles
// opened from it, so you can click through the results and leave the page and come back to
// them. Kept in memory only while the extension page is open (people's data is never stored),
// one org and data space at a time.

const MAX_PROFILES = 15
const memory = { key: '', search: null, lastPath: '', profiles: new Map() }

/** The memory for an org and data space; switching to another one starts empty. */
export function profileMemory(key) {
  if (memory.key !== key) forgetAll(memory, key)
  return memory
}

export function forgetAll(m, key = m.key) {
  m.key = key
  m.search = null
  m.lastPath = ''
  m.profiles.clear()
}

/** A loaded profile under its route, newest last; the oldest go past MAX_PROFILES. */
export function rememberProfile(m, path, state) {
  m.profiles.delete(path)
  m.profiles.set(path, state)
  while (m.profiles.size > MAX_PROFILES) m.profiles.delete(m.profiles.keys().next().value)
}

/** Route path of a result group. */
export const groupPath = (g) => (g.unifiedId ? `/profile/u/${g.unifiedId}` : `/profile/s/${g.sources[0].id}`)

/** Index of the result group a profile route shows (`kind` 'u' or 's'), or -1. */
export function groupIndex(groups, kind, id, unifiedId = null) {
  return (groups || []).findIndex((g) => (kind === 'u'
    ? g.unifiedId === id
    : g.sources.some((s) => s.id === id) || (!!unifiedId && g.unifiedId === unifiedId)))
}
