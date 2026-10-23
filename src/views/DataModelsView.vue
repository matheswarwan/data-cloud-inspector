<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import DownloadMenu from '../components/DownloadMenu.vue'
import DataTable from '../components/DataTable.vue'
import { useOrg, currentOrg } from '../app/useOrg.js'
import { useCatalog, ensureCatalog, ensureAllMappings, ensureStreams, ensureUsage } from '../app/useCatalog.js'
import { dataModelRows, dataModelMarkdown, dataModelSheets } from '../lib/dataModels.js'

const org = useOrg()
const catalog = useCatalog()
const all = ref(false)
const search = ref('')
const loading = ref(false)

async function load() {
  if (!org.version) return
  loading.value = true
  await ensureCatalog()
  await Promise.all([ensureAllMappings(), ensureStreams(), ensureUsage()])
  loading.value = false
}
onMounted(load)
watch(() => [org.orgId, org.version, org.dataSpace], load)

const rows = computed(() => (catalog.mappings ? dataModelRows(catalog.objects, catalog.mappings, catalog.streams, catalog.usage, { all: all.value }) : []))
const shown = computed(() => {
  const t = search.value.trim().toLowerCase()
  return t ? rows.value.filter((r) => r.obj.label.toLowerCase().includes(t) || r.obj.name.toLowerCase().includes(t)) : rows.value
})
const cols = [
  { key: 'dmo', label: 'Data model object', value: (r) => `${r.obj.label} ${r.obj.name}`, sortValue: (r) => r.obj.label },
  { key: 'category', label: 'Category', value: (r) => r.obj.category.replace(/_/g, ' ') },
  { key: 'fields', label: 'Fields', align: 'right', kind: 'number', value: (r) => r.obj.fields.length },
  { key: 'sources', label: 'Mapped from', value: (r) => r.sources.map((x) => [x.dlo, x.stream].filter(Boolean).join(' ')), sortValue: (r) => r.sources.map((x) => x.dlo).join(', ') },
  { key: 'usedBy', label: 'Used by', align: 'right', kind: 'number', headerClass: 'whitespace-nowrap', value: (r) => r.usedBy },
]
// What the table shows after its filters and sort; downloads use it.
const view = ref([])
const totalDmos = computed(() => catalog.objects.filter((o) => o.kind === 'DMO').length)
const getMarkdown = () => dataModelMarkdown(view.value, catalog.objects, catalog.mappings, catalog.streams, catalog.usage, { host: currentOrg()?.host, dataSpace: org.dataSpace })
const getSheets = () => dataModelSheets(view.value, catalog.usage)
</script>

<template>
  <section class="max-w-7xl mx-auto space-y-3">
    <div class="flex flex-wrap items-center gap-3">
      <div>
        <h2 class="text-lg font-semibold">Data models</h2>
        <p class="text-sm text-muted-foreground">The data model objects, where their data comes from and what uses them.</p>
      </div>
      <div class="ml-auto flex flex-wrap items-center gap-2 text-sm">
        <div class="inline-flex rounded-md border overflow-hidden" role="radiogroup" aria-label="Which DMOs">
          <button role="radio" :aria-checked="!all" :class="['px-2.5 py-1.5', !all ? 'bg-primary text-primary-foreground' : 'hover:bg-accent']" @click="all = false">Mapped DMOs</button>
          <button role="radio" :aria-checked="all" :class="['px-2.5 py-1.5 border-l', all ? 'bg-primary text-primary-foreground' : 'hover:bg-accent']" @click="all = true">All DMOs</button>
        </div>
        <input v-model="search" placeholder="Search" class="border rounded-md px-2 py-1.5 bg-background w-48" />
        <DownloadMenu :get-markdown="getMarkdown" :get-sheets="getSheets" :file-name="`data-models-${all ? 'all' : 'mapped'}`" :disabled="!view.length" />
      </div>
    </div>
    <p class="text-xs text-muted-foreground">
      <template v-if="!catalog.mappings">{{ catalog.mappingsProgress ? `Reading mappings: ${catalog.mappingsProgress}` : 'Reading the data model…' }}</template>
      <template v-else>{{ shown.length }} of {{ totalDmos }} DMOs{{ all ? '' : ' (with something mapped into them)' }}</template>
    </p>
    <DataTable :columns="cols" :rows="shown" :row-key="(r) => r.obj.name" :empty="catalog.mappings ? (search ? 'No DMOs match.' : 'No DMOs.') : ''" box-class="max-h-[calc(100vh-12rem)]" @view="(v) => (view = v)">
      <template #cell-dmo="{ row: r }"><RouterLink :to="`/objects/${r.obj.name}`" class="text-link hover:underline">{{ r.obj.label }}</RouterLink><div class="font-mono text-xs text-muted-foreground">{{ r.obj.name }}</div></template>
      <template #cell-sources="{ row: r }">
        <div class="text-xs">
          <div v-for="s in r.sources" :key="s.dlo"><RouterLink :to="`/objects/${s.dlo}`" class="font-mono text-link hover:underline">{{ s.dlo }}</RouterLink> <span class="text-muted-foreground">{{ s.fields.length }} fields{{ s.stream ? `, stream ${s.stream}` : '' }}</span></div>
          <span v-if="!r.sources.length" class="text-muted-foreground">nothing mapped</span>
        </div>
      </template>
      <template #cell-usedBy="{ value }">{{ value || '' }}</template>
    </DataTable>
  </section>
</template>
