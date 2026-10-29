// What the Ctrl/Cmd+K search and Home's search box look through: pages, objects and fields,
// segments and saved queries (lib/palette.js), loaded on first use.
import { ref, computed } from 'vue'
import { NAV } from './router.js'
import { useOrg } from './useOrg.js'
import { useCatalog, ensureCatalog } from './useCatalog.js'
import { useQueries, loadQueries } from './useQueries.js'
import { ensureSegments } from './useSegments.js'
import { paletteItems } from '../lib/palette.js'

const segments = ref([])

export async function loadSearchIndex() {
  const org = useOrg()
  ensureCatalog()
  loadQueries()
  if (org.version) {
    // The shared segment list (feedback #1043): no second read of every segment.
    segments.value = (await ensureSegments().catch(() => [])).map((s) => ({ apiName: s.apiName, label: s.label }))
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
