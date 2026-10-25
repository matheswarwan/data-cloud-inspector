<script setup>
import DataTable from '../components/DataTable.vue'
import Loading from '../components/Loading.vue'
import JsonViewer from '../components/JsonViewer.vue'
import HelpTip from '../components/HelpTip.vue'
import DownloadMenu from '../components/DownloadMenu.vue'
import { docFrom, sheetsFrom } from '../lib/tableDoc.js'
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { RefreshCw } from 'lucide-vue-next'
import { useOrg, currentOrg, orgTitle } from '../app/useOrg.js'
import { orgCall, ensureDataGraphs } from '../app/useCatalog.js'
import { runQuery } from '../lib/query.js'
import { recordUrl } from '../lib/links.js'
import { loadSetup, loadActivity, pointTree, experimentTree, nameOf, ACTIVITY_SQL, personalizationStatus } from '../lib/personalization.js'
import { labelOf, nameOf as graphName, scalars, objectTree } from '../lib/dataGraphs.js'
import GraphTree from '../components/GraphTree.vue'

const router = useRouter()
const org = useOrg()
const setup = ref(null)
const activity = ref(null)
const graphs = ref(null)
const graphsError = ref('')
const rawGraph = ref(null)
const loading = ref(false)
const days = ref(30)
const tab = ref('setup')

const q = async (sql) => runQuery(orgCall(), org.version, sql, { rowLimit: 2000 })

async function load() {
  if (!org.version) return
  loading.value = true
  const orgId = org.orgId
  const [s, a] = await Promise.all([loadSetup(orgCall(), org.version), loadActivity(q, { days: days.value })])
  if (org.orgId !== orgId) return
  setup.value = s
  activity.value = a
  graphsError.value = ''
  graphs.value = await ensureDataGraphs({ refresh: true }).catch((err) => { graphsError.value = err.message; return [] })
  loading.value = false
}
onMounted(load)
watch(() => [org.orgId, org.version, org.dataSpace], load)
watch(days, async () => { activity.value = await loadActivity(q, { days: days.value }) })

const points = computed(() => (setup.value ? pointTree(setup.value) : []))
const experiments = computed(() => (setup.value ? experimentTree(setup.value) : []))
const totals = computed(() => {
  const d = activity.value?.daily || []
  return { requests: d.reduce((n, r) => n + Number(r.requests || 0), 0), days: d.length }
})
const maxDaily = computed(() => Math.max(1, ...(activity.value?.daily || []).map((r) => Number(r.requests || 0))))
// An org without Personalization gets one plain message, not an error per tab (feedback #114).
const status = computed(() => personalizationStatus(setup.value, activity.value))
const errors = (k) => (status.value.setupMissing ? '' : setup.value?.errors?.[k])
const sf = (id) => recordUrl(currentOrg()?.host, id)
const when = (iso) => (iso ? new Date(iso).toLocaleString() : '')
const num = (n) => (n == null || n === '' ? '' : Number(n).toLocaleString())
const card = 'border rounded-md bg-card'
const tabBtn = (t) => ['px-3 py-1.5 text-sm border-b-2', tab.value === t ? 'border-primary font-medium' : 'border-transparent text-muted-foreground hover:text-foreground']
const btn = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-sm hover:bg-accent disabled:opacity-50'
const decisionCols = [
  { key: 'Priority', label: 'Priority', kind: 'number' },
  { key: 'Name', label: 'Decision' },
  { key: 'State', label: 'State' },
  { key: 'personalizerName', label: 'Recommender' },
  { key: 'experimentName', label: 'Experiment' },
]
const recommenderCols = [
  { key: 'Name', label: 'Recommender', value: (r) => `${r.Name} ${r.Description || ''}`, sortValue: (r) => r.Name },
  { key: 'status', label: 'Status', value: (r) => [r.Status, r.State].filter(Boolean).join(', ') },
  { key: 'LastRefresh', label: 'Last refresh', kind: 'date', value: (r) => when(r.LastRefresh), sortValue: (r) => r.LastRefresh || '', filter: false },
  { key: 'LastSuccessfulRefresh', label: 'Last success', kind: 'date', value: (r) => when(r.LastSuccessfulRefresh), sortValue: (r) => r.LastSuccessfulRefresh || '', filter: false },
  { key: 'Goal', label: 'Goal' },
  { key: 'every', label: 'Every', kind: 'number', value: (r) => (r.ScheduleFrequencyInMinutes ? `${r.ScheduleFrequencyInMinutes} min` : ''), sortValue: (r) => r.ScheduleFrequencyInMinutes },
]
const schemaCols = [
  { key: 'Name', label: 'Content schema', value: (x) => `${x.Name} ${x.DeveloperName || ''}`, sortValue: (x) => x.Name },
  { key: 'PersonalizationType', label: 'Type' },
  { key: 'Description', label: 'Description' },
]
const objectiveCols = [
  { key: 'Name', label: 'Objective' },
  { key: 'Description', label: 'Description' },
]
const byDecisionCols = computed(() => [
  { key: 'point', label: 'Point', value: (r) => nameOf(setup.value, r.point) },
  { key: 'decision', label: 'Decision', value: (r) => nameOf(setup.value, r.decision) },
  { key: 'personalizer', label: 'Recommender', value: (r) => nameOf(setup.value, r.personalizer) },
  { key: 'requests', label: 'Requests', align: 'right', kind: 'number', value: (r) => num(r.requests), sortValue: (r) => Number(r.requests) },
  { key: 'people', label: 'People', align: 'right', kind: 'number', value: (r) => num(r.people), sortValue: (r) => Number(r.people) },
])
const statusCols = [
  { key: 'status', label: 'Status code', value: (r) => String(r.status || 'none') },
  { key: 'n', label: 'Requests', align: 'right', kind: 'number', value: (r) => num(r.n), sortValue: (r) => Number(r.n) },
]
const recentCols = computed(() => [
  { key: 'at', label: 'When', kind: 'date', value: (r) => when(r.at), sortValue: (r) => r.at || '', filter: false },
  { key: 'point', label: 'Point', value: (r) => `${nameOf(setup.value, r.point)} ${nameOf(setup.value, r.decision)}` },
  { key: 'individual', label: 'Person' },
  { key: 'details', label: 'Details', value: (r) => [r.channel, r.content, r.items != null ? `${r.items} items` : ''].filter(Boolean).join(' · ') },
  { key: 'status', label: 'Status', align: 'right', value: (r) => `${r.status} · ${Math.round(r.ms || 0)} ms`, sortValue: (r) => r.ms },
])

// Download (feedback #149): the whole setup and the activity read for the chosen period
function sections() {
  const out = []
  for (const p of points.value) out.push({ heading: `Point: ${p.Name}`, kv: [['API name', p.DeveloperName], ['Status', p.Status], ['Schema', p.schemaName || ''], ['Source', p.Source || ''], ['Max items', p.MaxItemsCount ?? ''], ['Experiment', p.experimentName || '']] }, { heading: `Decisions: ${p.Name}`, columns: decisionCols, rows: p.decisions })
  out.push({ heading: 'Recommenders', columns: recommenderCols, rows: setup.value.recommenders })
  out.push({ heading: 'Experiments', list: experiments.value.map((e) => `${e.Name}: ${[e.Status, e.State].filter(Boolean).join(', ')}${e.decisions.length ? ` (${e.decisions.map((d) => d.decisionName).join(', ')})` : ''}`) })
  out.push({ heading: 'Content schemas', columns: schemaCols, rows: setup.value.schemas }, { heading: 'Objectives', columns: objectiveCols, rows: setup.value.objectives })
  if (activity.value && !status.value.logMissing) {
    out.push({ heading: `Requests per day (last ${days.value} days)`, columns: [{ key: 'day', label: 'Day' }, { key: 'requests', label: 'Requests' }, { key: 'people', label: 'People' }], rows: activity.value.daily })
    out.push({ heading: 'By decision', columns: byDecisionCols.value, rows: activity.value.byDecision }, { heading: 'By status', columns: statusCols, rows: activity.value.byStatus }, { heading: 'Latest requests', columns: recentCols.value, rows: activity.value.recent })
  }
  return out
}
const doc = () => docFrom({ title: 'Personalization', intro: `${orgTitle(org.orgId)}, data space ${org.dataSpace || 'default'}.`, sections: sections() })
</script>

<template>
  <section class="max-w-6xl mx-auto space-y-4">
    <div class="flex flex-wrap items-center gap-3">
      <div>
        <h2 class="text-lg font-semibold">Personalization <HelpTip topic="personalization" /></h2>
        <p class="text-sm text-muted-foreground">Salesforce Personalization setup (points, decisions, recommenders, experiments) and what the personalization log recorded.</p>
      </div>
      <span class="ml-auto"><DownloadMenu :get-doc="doc" :get-sheets="() => sheetsFrom(sections())" file-name="personalization" :disabled="!setup" /></span>
      <button :class="btn" :disabled="loading" @click="load"><RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" /> Load again</button>
    </div>
    <Loading v-if="loading && !setup" text="Reading the setup and the log…" />

    <div v-if="setup && (status.setupMissing || status.logMissing)" class="p-3 rounded-md border border-sky-300 bg-sky-50 dark:bg-sky-950/40 dark:border-sky-800 text-sm space-y-2">
      <p v-if="status.setupMissing"><strong>Personalization is not set up in this org.</strong> Salesforce answers that its setup objects (personalization points, decisions, recommenders) are not supported here, which means Personalization is not provisioned or not enabled. Data graphs, below, can still be used without it.</p>
      <p v-if="status.logMissing">{{ status.setupMissing ? 'There is also no personalization log' : 'There is no personalization log' }} in this data space (<span class="font-mono text-xs">ssot__PersonalizationLog__dlm</span>), so there is no activity to show.</p>
      <details class="text-xs">
        <summary class="cursor-pointer text-muted-foreground">Technical details ({{ status.details.length }})</summary>
        <ul class="mt-2 space-y-1">
          <li v-for="(d, i) in status.details" :key="i"><span class="font-medium">{{ d.area }}:</span> <span class="font-mono break-all text-muted-foreground">{{ d.error }}</span></li>
        </ul>
      </details>
    </div>

    <template v-if="setup">
      <nav class="flex border-b">
        <button :class="tabBtn('setup')" @click="tab = 'setup'">Points and decisions ({{ points.length }})</button>
        <button :class="tabBtn('recommenders')" @click="tab = 'recommenders'">Recommenders ({{ setup.recommenders.length }})</button>
        <button :class="tabBtn('experiments')" @click="tab = 'experiments'">Experiments ({{ experiments.length }})</button>
        <button :class="tabBtn('schemas')" @click="tab = 'schemas'">Schemas and objectives ({{ setup.schemas.length + setup.objectives.length }})</button>
        <button :class="tabBtn('activity')" @click="tab = 'activity'">Activity</button>
        <button :class="tabBtn('graphs')" @click="tab = 'graphs'">Data graphs{{ graphs ? ` (${graphs.length})` : '' }}</button>
      </nav>

      <!-- Points and decisions -->
      <div v-if="tab === 'setup'" class="space-y-3">
        <p v-if="errors('points')" class="text-sm text-destructive">{{ errors('points') }}</p>
        <p v-else-if="!points.length" class="text-sm text-muted-foreground">No personalization points in this org.</p>
        <div v-for="p in points" :key="p.Id" :class="card">
          <div class="p-3 border-b flex flex-wrap items-baseline gap-2">
            <a :href="sf(p.Id)" target="_blank" rel="noopener" class="font-medium text-link hover:underline">{{ p.Name }}</a>
            <span class="font-mono text-xs text-muted-foreground">{{ p.DeveloperName }}</span>
            <span class="ml-auto text-sm">{{ p.Status }}</span>
          </div>
          <div class="p-3 text-sm space-y-2">
            <div class="text-muted-foreground">
              {{ [p.schemaName && `schema ${p.schemaName}`, p.Source && `source ${p.Source}`, p.MaxItemsCount && `up to ${p.MaxItemsCount} items`, p.IsAuthenticationRequired && 'known people only', p.experimentName && `experiment ${p.experimentName}`].filter(Boolean).join(' · ') }}
            </div>
            <p v-if="!p.decisions.length" class="text-muted-foreground">No decisions.</p>
            <DataTable v-else :columns="decisionCols" :rows="p.decisions" row-key="Id" :bordered="false">
              <template #cell-Name="{ row: d }"><a :href="sf(d.Id)" target="_blank" rel="noopener" class="text-link hover:underline">{{ d.Name }}</a></template>
            </DataTable>
          </div>
        </div>
      </div>

      <!-- Recommenders -->
      <div v-else-if="tab === 'recommenders'">
        <p v-if="errors('recommenders')" class="text-sm text-destructive">{{ errors('recommenders') }}</p>
        <p v-else-if="!setup.recommenders.length" class="text-sm text-muted-foreground">No recommenders in this org.</p>
        <DataTable v-else :columns="recommenderCols" :rows="setup.recommenders" row-key="Id">
          <template #cell-Name="{ row: r }"><a :href="sf(r.Id)" target="_blank" rel="noopener" class="text-link hover:underline">{{ r.Name }}</a><div class="text-xs text-muted-foreground">{{ r.Description }}</div></template>
          <template #cell-LastRefresh="{ row: r, value }">{{ value }}<div class="text-xs" :class="/fail|error/i.test(r.LatestRefreshedStatus || '') ? 'text-destructive' : 'text-muted-foreground'">{{ r.LatestRefreshedStatus }}</div></template>
        </DataTable>
      </div>

      <!-- Experiments -->
      <div v-else-if="tab === 'experiments'" class="space-y-3">
        <p v-if="errors('experiments')" class="text-sm text-destructive">{{ errors('experiments') }}</p>
        <p v-else-if="!experiments.length" class="text-sm text-muted-foreground">No experiments in this org.</p>
        <div v-for="e in experiments" :key="e.Id" :class="[card, 'p-3 text-sm space-y-1']">
          <div class="flex flex-wrap items-baseline gap-2">
            <a :href="sf(e.Id)" target="_blank" rel="noopener" class="font-medium text-link hover:underline">{{ e.Name }}</a>
            <span class="ml-auto">{{ [e.Status, e.State].filter(Boolean).join(', ') }}</span>
          </div>
          <div class="text-muted-foreground">
            {{ [e.StartedDate && `started ${when(e.StartedDate)}`, e.StoppedDate && `stopped ${when(e.StoppedDate)}`, e.WinnerSelectionMode && `winner ${e.WinnerSelectionMode.toLowerCase()}`, e.WinnerSelectionOutcome && `outcome ${e.WinnerSelectionOutcome}`, e.LastAnalyzed && `analysed ${when(e.LastAnalyzed)}`].filter(Boolean).join(' · ') }}
          </div>
          <ul v-if="e.decisions.length" class="list-disc pl-5">
            <li v-for="d in e.decisions" :key="d.PersonalizationDecisionId">{{ d.decisionName }} <span class="text-muted-foreground">{{ [d.ExperimentStatus, d.ExperimentState].filter(Boolean).join(', ') }}</span></li>
          </ul>
        </div>
      </div>

      <!-- Schemas and objectives -->
      <div v-else-if="tab === 'schemas'" class="space-y-3">
        <DataTable v-if="setup.schemas.length" :columns="schemaCols" :rows="setup.schemas" row-key="Id">
          <template #cell-Name="{ row: x }"><a :href="sf(x.Id)" target="_blank" rel="noopener" class="text-link hover:underline">{{ x.Name }}</a><div class="font-mono text-xs text-muted-foreground">{{ x.DeveloperName }}</div></template>
          <template #cell-Description="{ value }"><span class="text-muted-foreground">{{ value }}</span></template>
        </DataTable>
        <p v-else class="text-sm text-muted-foreground">No content schemas.</p>
        <DataTable v-if="setup.objectives.length" :columns="objectiveCols" :rows="setup.objectives" row-key="Id">
          <template #cell-Description="{ value }"><span class="text-muted-foreground">{{ value }}</span></template>
        </DataTable>
        <p v-else class="text-sm text-muted-foreground">No objectives.</p>
      </div>

      <!-- Data graphs -->
      <div v-if="tab === 'graphs'" class="space-y-3">
        <p v-if="graphsError" class="text-sm text-destructive">{{ graphsError }}</p>
        <p v-else-if="graphs && !graphs.length" class="text-sm text-muted-foreground">No data graphs in this data space. Data graphs feed Personalization and Agentforce with a person's data in one call.</p>
        <div v-for="g in graphs || []" :key="graphName(g)" :class="[card, 'p-3 text-sm space-y-2']">
          <div class="flex items-baseline gap-2">
            <span class="font-medium">{{ labelOf(g) }}</span>
            <span class="font-mono text-xs text-muted-foreground">{{ graphName(g) }}</span>
            <RouterLink :to="`/graphs/${graphName(g)}`" class="ml-auto text-xs text-link hover:underline">Open in Data graphs</RouterLink>
            <button class="text-xs text-link hover:underline" @click="rawGraph = rawGraph === g ? null : g">{{ rawGraph === g ? 'Hide' : 'Show' }} raw JSON</button>
          </div>
          <dl class="grid grid-cols-[12rem_1fr] gap-x-3 gap-y-0.5 text-xs">
            <template v-for="[k, v] in scalars(g)" :key="k"><dt class="text-muted-foreground">{{ k }}</dt><dd class="break-all">{{ v }}</dd></template>
          </dl>
          <div v-if="objectTree(g).length">
            <div class="text-xs text-muted-foreground mb-1">Objects</div>
            <GraphTree :nodes="objectTree(g)" />
          </div>
          <JsonViewer v-if="rawGraph === g" :value="g" :file-name="`data-graph-${graphName(g)}`" box-class="max-h-96" />
        </div>
      </div>

      <!-- Activity -->
      <div v-if="tab === 'activity'" class="space-y-4">
        <div class="flex items-center gap-2 text-sm">
          <label for="days" class="text-muted-foreground">Period</label>
          <select id="days" v-model.number="days" class="border rounded-md px-2 py-1 bg-background">
            <option :value="7">Last 7 days</option><option :value="30">Last 30 days</option><option :value="90">Last 90 days</option>
          </select>
          <span class="text-muted-foreground">{{ num(totals.requests) }} requests</span>
          <button class="ml-auto text-xs text-link hover:underline" @click="router.push({ path: '/sql', query: { sql: ACTIVITY_SQL.recent() } })">Open the log in SQL</button>
        </div>
        <template v-if="!status.logMissing"><p v-for="(e, k) in activity?.errors" :key="k" class="text-sm text-destructive">{{ k }}: {{ e }}</p></template>
        <p v-if="activity && !status.logMissing && !totals.requests && !activity.recent.length" class="text-sm text-muted-foreground">
          The personalization log has no requests in this period. Requests appear here once a site or app calls Salesforce Personalization.
        </p>
        <template v-else-if="activity">
          <div :class="[card, 'p-3']">
            <div class="text-sm font-medium mb-2">Requests per day</div>
            <div class="flex items-end gap-0.5 h-32">
              <div v-for="d in activity.daily" :key="d.day" class="flex-1 bg-foreground/70 min-w-0.5" :style="{ height: `${(Number(d.requests) / maxDaily) * 100}%` }" :title="`${d.day}: ${num(d.requests)} requests, ${num(d.people)} people, ${Math.round(d.avg_ms || 0)} ms on average`" />
            </div>
          </div>
          <div class="grid md:grid-cols-[2fr_1fr] gap-4">
            <DataTable :columns="byDecisionCols" :rows="activity.byDecision" />
            <DataTable :columns="statusCols" :rows="activity.byStatus" row-key="status" />
          </div>
          <div :class="card">
            <h3 class="p-3 border-b font-medium">Latest requests</h3>
            <DataTable :columns="recentCols" :rows="activity.recent" :bordered="false" box-class="max-h-[60vh]">
              <template #cell-at="{ value }"><span class="whitespace-nowrap">{{ value }}</span></template>
              <template #cell-point="{ row: r }">{{ nameOf(setup, r.point) }}<div class="text-xs text-muted-foreground">{{ nameOf(setup, r.decision) }}</div></template>
              <template #cell-individual="{ value }"><RouterLink v-if="value" :to="`/profile/s/${value}`" class="text-link hover:underline font-mono text-xs">{{ value }}</RouterLink></template>
              <template #cell-details="{ value }"><span class="text-xs">{{ value }}</span></template>
              <template #cell-status="{ value }"><span class="whitespace-nowrap">{{ value }}</span></template>
            </DataTable>
          </div>
        </template>
      </div>
    </template>
  </section>
</template>
