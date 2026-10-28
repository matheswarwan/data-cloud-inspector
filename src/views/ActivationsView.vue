<script setup>
import { badgeClass } from '../lib/badges.js'
import PageHeader from '../components/PageHeader.vue'
import { ref, computed, watch, onMounted } from 'vue'
import Loading from '../components/Loading.vue'
import HelpTip from '../components/HelpTip.vue'
import { docFrom, sheetsFrom } from '../lib/tableDoc.js'
import ListPanel from '../components/ListPanel.vue'
import DataTable from '../components/DataTable.vue'
import DownloadMenu from '../components/DownloadMenu.vue'
import JsonViewer from '../components/JsonViewer.vue'
import { useRoute } from 'vue-router'
import { ArrowRight, ExternalLink, RefreshCw, Search, Send, Users } from 'lucide-vue-next'
import { useOrg, currentOrg, orgName, orgTitle } from '../app/useOrg.js'
import { orgCall } from '../app/useCatalog.js'
import { runQuery } from '../lib/query.js'
import { recordUrl } from '../lib/links.js'
import { toObjects } from '../lib/profile.js'
import { loadActivations, loadActivation, describeActivationFilter, activationMarkdown } from '../lib/activations.js'
import { activationHealth } from '../lib/health.js'
import { loadSegments } from '../lib/segments.js'

const route = useRoute()
const org = useOrg()
const list = ref([])
const loading = ref(false)
const error = ref('')
const act = ref(null)
const actError = ref('')
const counts = ref({})
const segments = ref([])

async function load() {
  if (!org.version) return
  loading.value = true
  error.value = ''
  try { list.value = await loadActivations(orgCall(), org.version) } catch (err) { error.value = err.message }
  segments.value = await loadSegments(orgCall(), org.version).catch(() => [])
  loading.value = false
}
onMounted(load)
watch(() => [org.orgId, org.version, org.dataSpace], load)

watch(() => [route.params.id, org.version], async ([id]) => {
  act.value = null
  actError.value = ''
  counts.value = {}
  if (!id || !org.version) return
  try {
    const a = await loadActivation(orgCall(), org.version, id)
    if (route.params.id !== id) return
    act.value = a
    for (const t of [a.latestAudience, a.historyAudience].filter(Boolean)) {
      runQuery(orgCall(), org.version, `SELECT COUNT(*) AS n FROM ${t}`, { rowLimit: 1 })
        .then((r) => { counts.value = { ...counts.value, [t]: Number(toObjects(r)[0]?.n ?? 0) } })
        .catch((err) => { counts.value = { ...counts.value, [t]: err.message } })
    }
  } catch (err) {
    actError.value = err.message
  }
}, { immediate: true })

// The activation names its segment by display name; find the segment by ID for the link.
const segmentApi = computed(() => segments.value.find((s) => act.value?.segmentId && s.id.slice(0, 15) === act.value.segmentId.slice(0, 15))?.apiName || '')
const DOT = { fail: 'bg-red-500', warn: 'bg-amber-400', running: 'bg-sky-500', idle: 'bg-gray-400', ok: 'bg-green-500' }
const when = (iso) => (iso ? new Date(iso).toLocaleString() : 'never')
const num = (n) => (typeof n === 'number' ? n.toLocaleString() : n || '…')
const btn = 'dci-btn'
// Download of the list (feedback #149)
const listCols = [
  { key: 'name', label: 'Activation' }, { key: 'developerName', label: 'API name' }, { key: 'segment', label: 'Segment' }, { key: 'target', label: 'Target' },
  { key: 'status', label: 'Status', value: (a) => a.status.toLowerCase() }, { key: 'lastPublishStatus', label: 'Last publish', value: (a) => a.lastPublishStatus.toLowerCase() || 'never' },
  { key: 'lastPublish', label: 'Published at', value: (a) => (a.lastPublish ? new Date(a.lastPublish).toLocaleString() : '') }, { key: 'refreshType', label: 'Refresh', value: (a) => a.refreshType.toLowerCase() },
  { key: 'health', label: 'Health', value: (a) => activationHealth(a).reason },
]
const listSections = () => [{ heading: 'Activations', columns: listCols, rows: list.value }]
const listDoc = () => docFrom({ title: 'Activations', intro: `${orgTitle(org.orgId)}, data space ${org.dataSpace || 'default'}. ${list.value.length} activations.`, sections: listSections() })
// Attributes sent: filter by object, field, label or output name.
const attrText = ref('')
const attrRows = computed(() => {
  const t = attrText.value.trim().toLowerCase()
  const all = act.value?.attributes || []
  return t ? all.filter((x) => [x.entity, x.name, x.label, x.output].some((v) => String(v || '').toLowerCase().includes(t))) : all
})
const attrCols = [
  { key: 'field', label: 'Field', value: (x) => `${x.entity.replace(/^ssot__|__dlm$/g, '')}.${x.name} ${x.label || ''}`, sortValue: (x) => `${x.entity}.${x.name}` },
  { key: 'output', label: 'Sent as' },
  { key: 'type', label: 'Type' },
]
</script>

<template>
  <div class="space-y-5">
  <PageHeader path="/activations" topic="activations">Each activation, the segment it sends, where it goes and which attributes go with it.</PageHeader>
  <section class="flex gap-4 min-h-0">
    <ListPanel name="activations" label="activations list">
      <div class="flex items-center gap-2">
        <span class="text-xs text-muted-foreground"><strong class="text-foreground">{{ list.length }}</strong> activations</span>
        <span class="ml-auto"><DownloadMenu small label="Download" :get-doc="listDoc" :get-sheets="() => sheetsFrom(listSections())" file-name="activations" :disabled="!list.length" /></span>
        <button class="dci-btn-icon" title="Load again" @click="load"><RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" /></button>
      </div>
      <p v-if="error" class="text-xs text-destructive">{{ error }}</p>
      <p v-else-if="!loading && !list.length" class="text-sm text-muted-foreground">No activations in this data space.</p>
      <ul class="text-sm">
        <li v-for="a in list" :key="a.id">
          <RouterLink :to="`/activations/${a.id}`" :class="['block px-2.5 py-1.5 rounded-lg border', a.id === route.params.id ? 'bg-teal-50 border-teal-200 dark:bg-teal-500/10 dark:border-teal-500/30' : 'border-transparent hover:bg-accent']">
            <div class="flex items-center gap-2"><span :class="['w-2 h-2 rounded-full shrink-0', DOT[activationHealth(a).level]]" /><span class="truncate">{{ a.name }}</span></div>
            <div class="text-xs text-muted-foreground truncate pl-4">{{ a.segment }} to {{ a.target }}</div>
          </RouterLink>
        </li>
      </ul>
    </ListPanel>

    <div class="flex-1 min-w-0 space-y-4">
      <Loading v-if="!route.params.id && loading" text="Loading activations" class="p-4" />
      <p v-else-if="!route.params.id" class="dci-card text-sm text-muted-foreground p-8 text-center">Pick an activation to see what it sends, where, and when it last published.</p>
      <p v-if="actError" class="text-sm text-destructive">{{ actError }}</p>
      <template v-if="act">
        <div class="flex flex-wrap items-start gap-3">
          <div class="min-w-0 space-y-1">
            <h2 class="text-2xl font-bold leading-[30px] break-words">{{ act.name }}</h2>
            <div class="font-mono text-[13px] text-muted-foreground break-all">{{ act.developerName }}</div>
            <div class="flex flex-wrap gap-1.5">
              <span :class="badgeClass(act.enabled ? act.status : 'disabled')">{{ act.status.toLowerCase() }}{{ act.enabled ? '' : ', disabled' }}</span>
              <span class="dci-badge">{{ [act.refreshType, act.processing].filter(Boolean).join(', ').toLowerCase() }}{{ act.excludeDeletes ? ', deletes not sent' : '' }}{{ act.excludeUpdates ? ', updates not sent' : '' }}</span>
            </div>
          </div>
          <div class="ml-auto flex items-center gap-2">
            <DownloadMenu :get-markdown="() => activationMarkdown(act, { counts, host: orgTitle(org.orgId) })" :get-sheets="() => [{ name: 'Attributes', columns: ['Object', 'Field', 'Label', 'Sent as', 'Type'], rows: act.attributes.map((x) => [x.entity, x.name, x.label, x.output, x.type]) }]" :file-name="`activation-${act.developerName}`" />
            <a class="dci-btn-icon" :href="recordUrl(currentOrg()?.host, act.id)" target="_blank" rel="noopener" title="Open in Salesforce" aria-label="Open in Salesforce"><ExternalLink class="w-4 h-4" /></a>
          </div>
        </div>
        <div class="dci-card p-4 flex flex-wrap items-center gap-x-5 gap-y-3">
          <div class="flex items-center gap-3 min-w-0">
            <span class="w-10 h-10 shrink-0 rounded-xl bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300 flex items-center justify-center"><Users class="w-5 h-5" aria-hidden="true" /></span>
            <div class="min-w-0">
              <div class="text-xs text-muted-foreground">Segment · activates {{ act.subjectLabel || act.subject }}</div>
              <RouterLink v-if="segmentApi" :to="`/segments/${segmentApi}`" class="font-semibold text-link hover:underline break-all">{{ act.segment }}</RouterLink><span v-else class="font-semibold break-all">{{ act.segment }}</span>
              <div class="font-mono text-xs text-muted-foreground">{{ act.subject }}</div>
            </div>
          </div>
          <ArrowRight class="w-5 h-5 text-muted-foreground shrink-0" aria-hidden="true" />
          <div class="flex items-center gap-3 min-w-0">
            <span class="w-10 h-10 shrink-0 rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300 flex items-center justify-center"><Send class="w-5 h-5" aria-hidden="true" /></span>
            <div class="min-w-0">
              <div class="text-xs text-muted-foreground">Target</div>
              <a v-if="act.targetId" :href="recordUrl(currentOrg()?.host, act.targetId)" target="_blank" rel="noopener" class="font-semibold text-link hover:underline break-all">{{ act.target }}</a><span v-else class="font-semibold break-all">{{ act.target }}</span>
              <div class="text-xs" :class="/fail|error/i.test(act.lastPublishStatus) ? 'text-destructive' : 'text-muted-foreground'">Last publish <span class="inline-flex items-center gap-1"><span :class="['w-2 h-2 rounded-full', /fail|error/i.test(act.lastPublishStatus) ? 'bg-red-500' : act.lastPublishStatus ? 'bg-green-600' : 'bg-gray-400']" />{{ act.lastPublishStatus.toLowerCase() || 'never' }}</span>, {{ when(act.lastPublish) }}</div>
            </div>
          </div>
        </div>
        <div class="grid xl:grid-cols-[3fr_2fr] gap-4 items-start">
          <div class="dci-card">
            <div class="px-5 py-3 border-b flex flex-wrap items-center gap-3">
              <h3 class="text-base font-semibold flex items-center gap-2">Attributes sent <span class="dci-count">{{ act.attributes.length }}</span></h3>
              <label class="dci-search ml-auto w-64"><Search class="w-4 h-4 shrink-0 text-teal-700 dark:text-teal-300" aria-hidden="true" /><input v-model="attrText" placeholder="Filter attributes" aria-label="Filter attributes" /></label>
            </div>
            <DataTable :columns="attrCols" :rows="attrRows" :row-key="(x) => x.entity + x.name" :bordered="false" text-size="text-sm" box-class="max-h-[70vh]">
              <template #cell-field="{ row: x }"><span class="inline-flex flex-wrap items-center gap-1.5"><span class="dci-badge">{{ x.entity.replace(/^ssot__|__dlm$/g, '') }}</span><span class="font-mono text-[13px] whitespace-nowrap">{{ x.name }}</span></span><div class="mt-0.5 text-xs text-muted-foreground">{{ x.label }}</div></template>
              <template #cell-output="{ value }"><span class="inline-flex items-center gap-2 font-mono text-[13px] text-teal-700 dark:text-teal-300 whitespace-nowrap"><ArrowRight class="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />{{ value }}</span></template>
            </DataTable>
          </div>
          <div class="space-y-4">
            <div class="dci-card p-5 text-sm space-y-1.5">
              <div class="text-base font-semibold">Contact points</div>
              <p v-if="!act.contactPoints.length" class="text-muted-foreground">None.</p>
              <div v-for="c in act.contactPoints" :key="c.entity"><RouterLink :to="`/objects/${c.entity}`" class="font-mono text-xs text-link hover:underline">{{ c.entity }}</RouterLink><div v-if="c.path.length" class="text-xs text-muted-foreground">through {{ c.path.join(' → ') }}</div></div>
            </div>
            <div class="dci-card p-5 text-sm space-y-2">
              <div class="text-base font-semibold flex items-center gap-2">Filters <span v-if="act.filters.length" class="dci-count">{{ act.filters.length }}</span></div>
              <p v-if="!act.filters.length" class="text-muted-foreground">None: every segment member is activated.</p>
              <div v-for="(f, i) in act.filters" :key="i" class="space-y-1 border-t pt-2 first-of-type:border-0">
                <ul v-if="describeActivationFilter(f)" class="text-xs space-y-0.5">
                  <li v-for="(l, j) in describeActivationFilter(f)" :key="j" :style="{ paddingLeft: `${l.depth * 1}rem` }">{{ l.text }}</li>
                </ul>
                <details class="text-xs">
                  <summary class="cursor-pointer text-muted-foreground">Filter {{ i + 1 }} as JSON</summary>
                  <div class="mt-1"><JsonViewer :value="f" :file-name="`${act.developerName}-filter-${i + 1}`" :open-depth="3" box-class="max-h-96" compact /></div>
                </details>
              </div>
            </div>
            <div class="dci-card p-5 text-sm space-y-2">
              <div class="text-base font-semibold">Audience</div>
              <div v-for="[label, t] in [['Latest', act.latestAudience], ['History', act.historyAudience]].filter(([, t]) => t)" :key="t" class="flex gap-2">
                <span class="w-16 text-muted-foreground">{{ label }}</span>
                <RouterLink :to="`/objects/${t}`" class="font-mono text-xs text-link hover:underline truncate">{{ t }}</RouterLink>
                <span class="ml-auto">{{ num(counts[t]) }} rows</span>
              </div>
              <div v-if="act.latestAudienceRun" class="text-xs text-muted-foreground">Latest audience built {{ when(act.latestAudienceRun) }}</div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </section>
  </div>
</template>
