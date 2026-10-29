<script setup>
// Data targets (feedback #1064): every activation target with its platform, connection, status
// and last publish, the activations that send to it, and its audience objects. An activation's
// Target links here.
import { badgeClass } from '../lib/badges.js'
import PageHeader from '../components/PageHeader.vue'
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { orgCached } from '../lib/store.js'
import { metadataTtl } from '../lib/cacheAge.js'
import Loading from '../components/Loading.vue'
import ListPanel from '../components/ListPanel.vue'
import DownloadMenu from '../components/DownloadMenu.vue'
import JsonViewer from '../components/JsonViewer.vue'
import { docFrom, sheetsFrom } from '../lib/tableDoc.js'
import { AlertCircle, ExternalLink, RefreshCw, Search, Send, Target } from 'lucide-vue-next'
import { useOrg, currentOrg, orgTitle } from '../app/useOrg.js'
import { orgCall } from '../app/useCatalog.js'
import { runQuery } from '../lib/query.js'
import { toObjects } from '../lib/profile.js'
import { recordUrl } from '../lib/links.js'
import { loadActivations } from '../lib/activations.js'
import { activationHealth } from '../lib/health.js'
import { loadTargets, targetHealth, inDataSpace, activationsFor, targetMarkdown } from '../lib/targets.js'

const route = useRoute()
const org = useOrg()
const all = ref([])
const activations = ref([])
const loading = ref(false)
const error = ref('')
const filter = ref('')

// Kept in this browser like the other org details; Load again reads the org now.
async function load({ refresh = false } = {}) {
  if (!org.version) return
  loading.value = true
  error.value = ''
  const base = `dci_s_${org.orgId}_${org.dataSpace || 'default'}`
  try {
    all.value = await orgCached(`${base}_targets`, metadataTtl(), () => loadTargets(orgCall(), org.version), { refresh, onUpdate: (v) => { all.value = v } })
  } catch (err) { error.value = err.message }
  activations.value = await orgCached(`${base}_activations`, metadataTtl(), () => loadActivations(orgCall(), org.version), { refresh, onUpdate: (v) => { activations.value = v } }).catch(() => [])
  loading.value = false
}
onMounted(load)
watch(() => [org.orgId, org.version, org.dataSpace], () => load())

const list = computed(() => inDataSpace(all.value, orgCall().dataSpaceId))
const shownList = computed(() => {
  const t = filter.value.trim().toLowerCase()
  return t ? list.value.filter((x) => [x.label, x.platform, x.connection, x.targetType].some((v) => v.toLowerCase().includes(t))) : list.value
})
const target = computed(() => all.value.find((t) => t.id === route.params.id || t.id.slice(0, 15) === String(route.params.id || '').slice(0, 15)) || null)
const uses = computed(() => (target.value ? activationsFor(target.value, activations.value) : []))
const health = computed(() => (target.value ? targetHealth(target.value) : null))

// Rows in the audience objects, counted when a target opens. The record names them without
// the __dlm suffix (AAL_SFMC_<target id>), so it is added for the query and the link.
const dmo = (n) => (/__dl[lm]$/.test(n) ? n : `${n}__dlm`)
const counts = ref({})
watch(target, (t) => {
  counts.value = {}
  if (!t || !org.version) return
  for (const name of [t.latestDmo, t.historyDmo, t.auditDmo].filter(Boolean)) {
    runQuery(orgCall(), org.version, `SELECT COUNT(*) AS n FROM ${dmo(name)}`, { rowLimit: 1 })
      .then((r) => { counts.value = { ...counts.value, [name]: Number(toObjects(r)[0]?.n ?? 0) } })
      .catch((err) => { counts.value = { ...counts.value, [name]: /not found|does not exist|unknown/i.test(err.message) ? 'not in this data space' : err.message } })
  }
}, { immediate: true })

const DOT = { fail: 'bg-red-500', warn: 'bg-amber-400', running: 'bg-sky-500', idle: 'bg-gray-400', ok: 'bg-green-500' }
const when = (iso) => (iso ? new Date(iso).toLocaleString() : '')
const num = (n) => (typeof n === 'number' ? n.toLocaleString() : n || '…')
const facts = computed(() => {
  const t = target.value
  if (!t) return []
  return [['Platform', t.platform], ['Connection type', t.connection], ['Target type', t.targetType], ['Output format', t.outputFormat],
    ['Export directory', t.directory], ['Export endpoint', t.endpoint], ['Owned by', t.ownedBy], ['Remote', t.remote ? 'Yes' : 'No'],
    ['Communication capping', t.capping ? 'On' : 'Off'], ['Privacy type', t.privacyType], ['Data space ID', t.dataSpaceId],
    ['Created', when(t.created)], ['Last modified', when(t.modified)]].filter(([, v]) => v)
})

const listCols = [
  { key: 'label', label: 'Target' }, { key: 'platform', label: 'Platform' }, { key: 'connection', label: 'Connection type' }, { key: 'targetType', label: 'Target type' },
  { key: 'status', label: 'Status' }, { key: 'runStatus', label: 'Run status' }, { key: 'publishAt', label: 'Last publish', value: (t) => when(t.publishAt) },
  { key: 'error', label: 'Error', value: (t) => t.publishError || t.statusError }, { key: 'activations', label: 'Activations', value: (t) => activationsFor(t, activations.value).length },
  { key: 'id', label: 'Record ID' },
]
const listSections = () => [{ heading: 'Data targets', columns: listCols, rows: list.value }]
const listDoc = () => docFrom({ title: 'Data targets', intro: `${orgTitle(org.orgId)}, data space ${org.dataSpace || 'default'}. ${list.value.length} targets.`, sections: listSections() })
</script>

<template>
  <div class="space-y-5">
    <PageHeader path="/targets" topic="targets">Where activations send: each data target with its platform, status, last publish and the activations that use it.</PageHeader>
    <section class="flex gap-4 min-h-0">
      <ListPanel name="targets" label="data targets list">
        <div class="flex items-center gap-2">
          <span class="text-xs text-muted-foreground"><strong class="text-foreground">{{ list.length }}</strong> targets</span>
          <span class="ml-auto"><DownloadMenu small label="Download" :get-doc="listDoc" :get-sheets="() => sheetsFrom(listSections())" file-name="data-targets" :disabled="!list.length" /></span>
          <button class="dci-btn-icon" title="Load again" aria-label="Load again" @click="load({ refresh: true })"><RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" /></button>
        </div>
        <label v-if="list.length > 5" class="dci-search"><Search class="w-4 h-4 shrink-0 text-teal-700 dark:text-teal-300" aria-hidden="true" /><input v-model="filter" placeholder="Filter targets" aria-label="Filter targets" /></label>
        <p v-if="error" class="text-xs text-destructive">Could not read ActivationTarget: {{ error }}</p>
        <p v-else-if="!loading && !list.length" class="text-sm text-muted-foreground">No data targets in this data space.</p>
        <ul class="text-sm">
          <li v-for="t in shownList" :key="t.id">
            <RouterLink :to="`/targets/${t.id}`" :class="['block px-2.5 py-1.5 rounded-lg border', target?.id === t.id ? 'bg-teal-50 border-teal-200 dark:bg-teal-500/10 dark:border-teal-500/30' : 'border-transparent hover:bg-accent']">
              <div class="flex items-center gap-2"><span :class="['w-2 h-2 rounded-full shrink-0', DOT[targetHealth(t).level]]" /><span class="truncate">{{ t.label }}</span></div>
              <div class="text-xs text-muted-foreground truncate pl-4">{{ [t.platform || t.connection, t.targetType].filter(Boolean).join(' · ') }} · {{ activationsFor(t, activations).length }} activations</div>
            </RouterLink>
          </li>
        </ul>
      </ListPanel>

      <div class="flex-1 min-w-0 space-y-4">
        <Loading v-if="!route.params.id && loading && !list.length" text="Loading data targets" class="p-4" />
        <p v-else-if="!route.params.id" class="dci-card text-sm text-muted-foreground p-8 text-center">Pick a data target to see where it sends, its status and the activations that use it.</p>
        <p v-else-if="!target && !loading" class="dci-card text-sm text-muted-foreground p-8 text-center">No data target {{ route.params.id }} in this org.</p>
        <template v-if="target">
          <div class="flex flex-wrap items-start gap-3">
            <span class="w-12 h-12 shrink-0 rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300 flex items-center justify-center" aria-hidden="true"><Target class="w-6 h-6" /></span>
            <div class="min-w-0 space-y-1 flex-1">
              <h2 class="text-2xl font-bold leading-[30px] break-words">{{ target.label }}</h2>
              <div class="font-mono text-[13px] text-muted-foreground break-all">{{ target.id }}</div>
              <div class="flex flex-wrap gap-1.5">
                <span v-if="target.status" :class="badgeClass(target.status)">{{ target.status.toLowerCase() }}</span>
                <span v-if="target.runStatus" :class="badgeClass(target.runStatus)">run: {{ target.runStatus.toLowerCase() }}</span>
                <span v-if="target.platform" class="dci-badge">{{ target.platform }}</span>
                <span v-if="target.capping" class="dci-badge dci-badge-violet">communication capping</span>
              </div>
              <p v-if="target.description" class="text-sm text-muted-foreground">{{ target.description }}</p>
            </div>
            <div class="flex items-center gap-2">
              <DownloadMenu :get-markdown="() => targetMarkdown(target, { activations: uses, host: orgTitle(org.orgId), counts })" :file-name="`data-target-${target.label}`" />
              <a class="dci-btn-icon" :href="recordUrl(currentOrg()?.host, target.id)" target="_blank" rel="noopener" title="Open in Salesforce" aria-label="Open in Salesforce"><ExternalLink class="w-4 h-4" /></a>
            </div>
          </div>

          <div v-if="health?.level === 'fail'" role="alert" class="flex items-start gap-3 px-4 py-3 rounded-xl border bg-red-50 border-red-200 text-red-800 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-300 text-sm">
            <AlertCircle class="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span><b>{{ target.publishError ? 'Last publish failed' : 'Target has an error' }}</b>: {{ health.reason }}<template v-if="target.publishAt || target.statusAt"> ({{ when(target.publishAt || target.statusAt) }})</template></span>
          </div>

          <div class="grid xl:grid-cols-[3fr_2fr] gap-4 items-start">
            <div class="space-y-4 min-w-0">
              <div class="dci-card">
                <div class="px-5 py-3 border-b"><h3 class="text-base font-semibold">Where it sends</h3></div>
                <dl class="px-5 py-4 grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <div v-for="[k, v] in facts" :key="k" class="min-w-0"><dt class="text-xs text-muted-foreground">{{ k }}</dt><dd class="font-medium break-words" :class="/ID|directory|endpoint/i.test(k) ? 'font-mono text-[13px]' : ''">{{ v }}</dd></div>
                </dl>
              </div>
              <div class="dci-card">
                <div class="px-5 py-3 border-b flex items-center gap-2"><h3 class="text-base font-semibold">Activations using it</h3><span class="dci-count">{{ uses.length }}</span></div>
                <p v-if="!uses.length" class="px-5 py-4 text-sm text-muted-foreground">No activation in this data space sends to this target.</p>
                <ul v-else class="divide-y text-sm">
                  <li v-for="a in uses" :key="a.id">
                    <RouterLink :to="`/activations/${a.id}`" class="flex items-center gap-3 px-5 py-2.5 hover:bg-accent">
                      <span :class="['w-2 h-2 rounded-full shrink-0', DOT[activationHealth(a).level]]" aria-hidden="true" />
                      <span class="min-w-0 flex-1"><span class="block truncate font-medium text-link">{{ a.name }}</span><span class="block truncate text-xs text-muted-foreground">{{ a.segment }}</span></span>
                      <span class="text-xs text-muted-foreground whitespace-nowrap">{{ (a.lastPublishStatus || 'never').toLowerCase() }}{{ a.lastPublish ? `, ${when(a.lastPublish)}` : '' }}</span>
                    </RouterLink>
                  </li>
                </ul>
              </div>
            </div>
            <div class="space-y-4 min-w-0">
              <div class="dci-card p-5 text-sm space-y-2">
                <div class="text-base font-semibold">Status</div>
                <div class="flex justify-between gap-3"><span class="text-muted-foreground">Target status</span><span class="text-right">{{ target.status.toLowerCase() || '—' }}<template v-if="target.statusAt"><br><span class="text-xs text-muted-foreground">{{ when(target.statusAt) }}</span></template></span></div>
                <div v-if="target.statusError" class="flex justify-between gap-3"><span class="text-muted-foreground">Error code</span><span class="text-right text-destructive font-mono text-xs">{{ target.statusError }}</span></div>
                <div class="flex justify-between gap-3"><span class="text-muted-foreground">Run status</span><span>{{ target.runStatus.toLowerCase() || '—' }}</span></div>
                <div class="flex justify-between gap-3"><span class="text-muted-foreground">Last publish</span><span class="text-right">{{ when(target.publishAt) || 'not recorded' }}</span></div>
                <div v-if="target.publishError" class="text-xs text-destructive break-words">{{ target.publishError }}</div>
              </div>
              <div class="dci-card p-5 text-sm space-y-2">
                <div class="text-base font-semibold">Audience objects</div>
                <p v-if="!target.latestDmo && !target.historyDmo && !target.auditDmo" class="text-muted-foreground">None recorded.</p>
                <div v-for="[label, t] in [['Latest', target.latestDmo], ['History', target.historyDmo], ['Audit', target.auditDmo]].filter(([, t]) => t)" :key="t" class="flex gap-2 items-baseline">
                  <span class="w-16 text-muted-foreground shrink-0">{{ label }}</span>
                  <RouterLink :to="`/objects/${dmo(t)}`" class="font-mono text-xs text-link hover:underline truncate min-w-0">{{ t }}</RouterLink>
                  <span class="ml-auto text-xs whitespace-nowrap">{{ typeof counts[t] === 'number' ? `${num(counts[t])} rows` : counts[t] || '…' }}</span>
                </div>
              </div>
              <details class="dci-card p-5 text-sm">
                <summary class="cursor-pointer font-semibold">All fields</summary>
                <div class="mt-2"><JsonViewer :value="target.raw" :file-name="`data-target-${target.id}`" :open-depth="1" box-class="max-h-96" compact /></div>
              </details>
            </div>
          </div>
        </template>
      </div>
    </section>
  </div>
</template>
