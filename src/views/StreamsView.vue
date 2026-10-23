<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { RefreshCw } from 'lucide-vue-next'
import { useOrg, currentOrg } from '../app/useOrg.js'
import { useCatalog, ensureCatalog, ensureStreams, ensureAllMappings, orgCall } from '../app/useCatalog.js'
import { recordUrl } from '../lib/links.js'
import { loadStream, fieldMap, describeSchedule } from '../lib/streams.js'
import { problemCounts, latestProblemsSql } from '../lib/problems.js'
import { streamHealth, LEVEL_TEXT } from '../lib/health.js'

const route = useRoute()
const router = useRouter()
const org = useOrg()
const catalog = useCatalog()
const filter = ref('')
const stream = ref(null)
const error = ref('')
const loading = ref(false)
const problems = ref(null)
const fieldText = ref('')
const mapsTo = ref(null)

// Streams load after the catalog: switching org or data space resets the catalog (and its
// streams), so loading them first could be wiped out.
const loadList = () => ensureCatalog().then(() => ensureStreams())
onMounted(loadList)
watch(() => [org.orgId, org.version, org.dataSpace], loadList)

const list = computed(() => {
  const t = filter.value.trim().toLowerCase()
  const all = (catalog.streams || []).map((s) => ({ ...s, health: streamHealth(s) }))
  return (t ? all.filter((s) => s.label.toLowerCase().includes(t) || s.name.toLowerCase().includes(t) || s.sourceObject.toLowerCase().includes(t)) : all).sort((a, b) => a.label.localeCompare(b.label))
})

watch(() => [route.params.name, org.version], async ([name]) => {
  stream.value = null
  problems.value = null
  mapsTo.value = null
  error.value = ''
  if (!name || !org.version) return
  loading.value = true
  try {
    const s = await loadStream(orgCall(), org.version, name)
    if (route.params.name !== name) return
    stream.value = s
    if (s.problemDlo) problems.value = (await problemCounts(orgCall(), org.version, [s.problemDlo])).get(s.problemDlo)
    const all = await ensureAllMappings()
    if (route.params.name === name) mapsTo.value = (all || []).filter((m) => m.source === s.dlo.name)
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}, { immediate: true })

const fields = computed(() => {
  if (!stream.value) return []
  const t = fieldText.value.trim().toLowerCase()
  const all = fieldMap(stream.value)
  return t ? all.filter((f) => f.name.toLowerCase().includes(t) || f.dloField.toLowerCase().includes(t)) : all
})
const DOT = { fail: 'bg-red-500', warn: 'bg-amber-400', running: 'bg-sky-500', idle: 'bg-gray-400', ok: 'bg-green-500' }
const when = (iso) => (iso ? new Date(iso).toLocaleString() : 'never')
const num = (n) => (n == null ? '—' : Number(n).toLocaleString())
const btn = 'inline-flex items-center px-2.5 py-1.5 rounded-md border text-sm hover:bg-accent disabled:opacity-50'
</script>

<template>
  <section class="flex gap-4 min-h-0">
    <aside class="w-80 shrink-0 space-y-2">
      <div class="flex gap-2">
        <input v-model="filter" placeholder="Search streams or source objects" class="flex-1 border rounded-md px-2 py-1 bg-background text-sm" />
        <button class="p-1.5 rounded-md border hover:bg-accent" title="Load the streams again" @click="catalog.streams = null; loadList()"><RefreshCw class="w-4 h-4" /></button>
      </div>
      <p class="text-xs text-muted-foreground">{{ list.length }} data streams</p>
      <ul class="max-h-[75vh] overflow-auto text-sm">
        <li v-for="s in list" :key="s.name">
          <RouterLink :to="`/streams/${s.name}`" :class="['block px-2 py-1.5 rounded-md hover:bg-accent', { 'bg-accent': s.name === route.params.name }]">
            <div class="flex items-center gap-2"><span :class="['w-2 h-2 rounded-full shrink-0', DOT[s.health.level]]" :title="s.health.reason" /><span class="truncate">{{ s.label }}</span></div>
            <div class="text-xs text-muted-foreground truncate pl-4">{{ s.connector }}{{ s.sourceObject ? `: ${s.sourceObject}` : '' }} · {{ num(s.totalRecords) }} records</div>
          </RouterLink>
        </li>
      </ul>
    </aside>

    <div class="flex-1 min-w-0 space-y-4">
      <p v-if="!route.params.name" class="text-sm text-muted-foreground p-4">{{ catalog.streams ? 'Pick a data stream to see its source, schedule, records and fields.' : 'Loading data streams…' }}</p>
      <p v-else-if="loading && !stream" class="text-sm text-muted-foreground">Loading…</p>
      <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
      <template v-if="stream">
        <div class="flex flex-wrap items-start gap-3">
          <div>
            <h2 class="text-lg font-semibold">{{ stream.label }}</h2>
            <div class="font-mono text-sm text-muted-foreground">{{ stream.name }}</div>
          </div>
          <div class="ml-auto flex gap-2">
            <a v-if="stream.recordId" :class="btn" :href="recordUrl(currentOrg()?.host, stream.recordId)" target="_blank" rel="noopener">Open in Salesforce</a>
          </div>
        </div>
        <dl class="border rounded-md bg-card p-3 grid grid-cols-[10rem_1fr] md:grid-cols-[10rem_1fr_10rem_1fr] gap-x-3 gap-y-1 text-sm">
          <dt class="text-muted-foreground">Source</dt><dd>{{ stream.connector }}{{ stream.sourceObject ? `: ${stream.sourceObject}` : '' }}<span v-if="stream.connectorName" class="text-xs text-muted-foreground"> ({{ stream.connectorName }})</span></dd>
          <dt class="text-muted-foreground">Status</dt><dd>{{ stream.status.toLowerCase() }}{{ stream.enabled ? '' : ', disabled' }}</dd>
          <dt class="text-muted-foreground">Last run</dt><dd>{{ stream.lastRunStatus === 'NONE' ? 'never run' : stream.lastRunStatus.toLowerCase() }}, {{ when(stream.lastRefresh) }}</dd>
          <dt class="text-muted-foreground">Schedule</dt><dd>{{ describeSchedule(stream) }}</dd>
          <dt class="text-muted-foreground">Records</dt><dd>{{ num(stream.totalRecords) }} total; last run added {{ num(stream.lastAdded) }}, processed {{ num(stream.lastProcessed) }}</dd>
          <dt class="text-muted-foreground">Type</dt><dd>{{ [stream.type, stream.accessMode].filter(Boolean).join(', ').toLowerCase() }}{{ stream.acceleration ? ', accelerated' : '' }}</dd>
          <dt class="text-muted-foreground">Data lake object</dt><dd><RouterLink :to="`/objects/${stream.dlo.name}`" class="font-mono text-xs text-link hover:underline">{{ stream.dlo.name }}</RouterLink></dd>
          <dt class="text-muted-foreground">Problem records</dt>
          <dd>
            <template v-if="!stream.problemDlo">none configured</template>
            <template v-else-if="!problems">…</template>
            <template v-else>{{ problems.error ? `could not count (${problems.error})` : `${num(problems.count)}${problems.latest ? `, latest ${when(problems.latest)}` : ''}` }}
              <button class="ml-1 text-xs text-link hover:underline" @click="router.push({ path: '/sql', query: { sql: latestProblemsSql(stream.problemDlo) } })">Open in SQL</button></template>
          </dd>
        </dl>
        <div class="border rounded-md bg-card p-3 text-sm">
          <div class="font-medium mb-1">Maps into</div>
          <p v-if="mapsTo === null" class="text-muted-foreground">{{ catalog.mappingsProgress ? `Reading mappings: ${catalog.mappingsProgress}` : 'Reading mappings…' }}</p>
          <p v-else-if="!mapsTo.length" class="text-muted-foreground">Its DLO is not mapped to any DMO.</p>
          <ul v-else class="space-y-0.5"><li v-for="m in mapsTo" :key="m.name"><RouterLink :to="`/objects/${m.target}`" class="font-mono text-xs text-link hover:underline">{{ m.target }}</RouterLink> <span class="text-xs text-muted-foreground">({{ m.fields.length }} fields)</span></li></ul>
        </div>
        <div class="border rounded-md bg-card">
          <div class="p-3 border-b flex items-center gap-2 text-sm">
            <span class="font-medium">Source fields ({{ stream.sourceFields.length }})</span>
            <input v-model="fieldText" placeholder="Filter fields" class="ml-auto border rounded-md px-2 py-0.5 bg-background text-xs w-56" />
          </div>
          <div class="max-h-[50vh] overflow-auto">
            <table class="w-full text-xs">
              <thead class="text-left text-muted-foreground sticky top-0 bg-card"><tr><th class="p-2 font-normal">Source field</th><th class="p-2 font-normal">Type</th><th class="p-2 font-normal">DLO field</th></tr></thead>
              <tbody>
                <tr v-for="f in fields" :key="f.name" class="border-t">
                  <td class="p-2 font-mono">{{ f.name }}</td><td class="p-2">{{ f.type }}</td>
                  <td class="p-2"><span class="font-mono">{{ f.dloField }}</span> <span class="text-muted-foreground">{{ f.dloField && f.dloLabel !== f.dloField ? f.dloLabel : '' }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>
