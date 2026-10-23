<script setup>
// Ctrl/Cmd+K search over everything (see lib/palette.js).
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { NAV } from '../app/router.js'
import { useOrg } from '../app/useOrg.js'
import { useCatalog, ensureCatalog, orgCall } from '../app/useCatalog.js'
import { useQueries, loadQueries } from '../app/useQueries.js'
import { loadSegments } from '../lib/segments.js'
import { sessionCached } from '../lib/store.js'
import { paletteItems, searchPalette } from '../lib/palette.js'

const router = useRouter()
const org = useOrg()
const catalog = useCatalog()
const queries = useQueries()
const open = ref(false)
const text = ref('')
const active = ref(0)
const input = ref(null)
const segments = ref([])

async function show() {
  open.value = true
  text.value = ''
  active.value = 0
  await nextTick()
  input.value?.focus()
  ensureCatalog()
  loadQueries()
  if (org.version) {
    const key = `dci_s_${org.orgId}_${org.dataSpace || 'default'}_segmentsList`
    segments.value = await sessionCached(key, 10 * 60 * 1000, () => loadSegments(orgCall(), org.version).then((l) => l.map((s) => ({ apiName: s.apiName, label: s.label })))).catch(() => [])
  }
}

const items = computed(() => paletteItems({
  pages: [...NAV, { path: '/sql/builder', label: 'Query Builder' }, { path: '/settings', label: 'Settings' }, { path: '/connection', label: 'Connection check' }],
  objects: catalog.objects, segments: segments.value, saved: queries.saved,
}))
const results = computed(() => searchPalette(items.value, text.value))
watch(text, () => { active.value = 0 })

function go(item) {
  if (!item) return
  open.value = false
  router.push(item.to)
}

function onKey(e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    open.value ? (open.value = false) : show()
    return
  }
  if (!open.value) return
  if (e.key === 'Escape') { open.value = false; e.preventDefault() }
  else if (e.key === 'ArrowDown') { active.value = Math.min(active.value + 1, results.value.length - 1); e.preventDefault() }
  else if (e.key === 'ArrowUp') { active.value = Math.max(active.value - 1, 0); e.preventDefault() }
  else if (e.key === 'Enter') { go(results.value[active.value]); e.preventDefault() }
}
onMounted(() => window.addEventListener('keydown', onKey, true))
onUnmounted(() => window.removeEventListener('keydown', onKey, true))
defineExpose({ show })
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-24 px-4" @mousedown.self="open = false">
    <div class="w-full max-w-2xl rounded-md border bg-card shadow-2xl" role="dialog" aria-label="Search">
      <input
        ref="input" v-model="text" placeholder="Search pages, objects, fields, segments, saved queries, or a person"
        class="w-full px-4 py-3 bg-transparent border-b outline-none text-sm"
      />
      <ul class="max-h-[60vh] overflow-auto py-1 text-sm">
        <li
          v-for="(r, i) in results" :key="`${r.kind}${r.label}${r.detail}`"
          :class="['px-4 py-1.5 flex items-baseline gap-3 cursor-pointer', i === active ? 'bg-accent' : '']"
          @mouseenter="active = i" @mousedown.prevent="go(r)"
        >
          <span class="w-20 shrink-0 text-xs text-muted-foreground">{{ r.kind }}</span>
          <span class="truncate">{{ r.label }}</span>
          <span class="ml-auto truncate text-xs text-muted-foreground font-mono max-w-[50%]">{{ r.detail }}</span>
        </li>
        <li v-if="!results.length" class="px-4 py-2 text-muted-foreground">Nothing found.</li>
      </ul>
      <div class="px-4 py-1.5 border-t text-xs text-muted-foreground">Enter to open · arrows to move · Esc to close</div>
    </div>
  </div>
</template>
