// What the Ctrl/Cmd+K search and Home's search box look through: pages, objects and fields,
// segments and saved queries (lib/palette.js), loaded on first use.
import { ref, computed } from 'vue'
import { NAV } from './router.js'
import { useOrg } from './useOrg.js'
import { useCatalog, ensureCatalog, orgCall } from './useCatalog.js'
import { useQueries, loadQueries } from './useQueries.js'
import { loadSegments } from '../lib/segments.js'
import { orgCached } from '../lib/store.js'
import { paletteItems } from '../lib/palette.js'

const segments = ref([])

export async function loadSearchIndex() {
  const org = useOrg()
  ensureCatalog()
  loadQueries()
  if (org.version) {
    const key = `dci_s_${org.orgId}_${org.dataSpace || 'default'}_segmentsList`
    segments.value = await orgCached(key, 10 * 60 * 1000, () => loadSegments(orgCall(), org.version).then((l) => l.map((s) => ({ apiName: s.apiName, label: s.label })))).catch(() => [])
  }
}

export function useSearchItems() {
  const catalog = useCatalog()
  const queries = useQueries()
  return computed(() => paletteItems({
    pages: [...NAV, { path: '/help', label: 'Help' }, { path: '/settings', label: 'Settings' }],
    objects: catalog.objects, segments: segments.value, saved: queries.saved,
  }))
}
