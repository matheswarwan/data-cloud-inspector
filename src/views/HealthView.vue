<script setup>
import DownloadMenu from '../components/DownloadMenu.vue'
import Loading from '../components/Loading.vue'
import HelpTip from '../components/HelpTip.vue'
import DataTable from '../components/DataTable.vue'
import { ref, computed, watch, onMounted } from 'vue'
import { RefreshCw } from 'lucide-vue-next'
import { useOrg, currentOrg, orgName, orgTitle } from '../app/useOrg.js'
import { orgCall, useCatalog, ensureCatalog } from '../app/useCatalog.js'
import { runQuery } from '../lib/query.js'
import { detailPath, unwrap, statusFields } from '../lib/healthDetails.js'
import { normalizeSegment, membershipTables, publishHistory } from '../lib/segments.js'
import { useJob, startJob, markSeen } from '../app/useJobs.js'
import { healthJobId } from '../app/usePreload.js'
import { recordUrl } from '../lib/links.js'
import { loadHealth, countLevels, healthMarkdown, LEVELS, LEVEL_TEXT } from '../lib/health.js'
import { latestProblemsSql } from '../lib/problems.js'
import { useRouter } from 'vue-router'

const org = useOrg()
const router = useRouter()
const problemsOnly = ref(false)
const notice = ref('')

// The check runs as a background job per org and data space: leave the page, come back, and
// the result is there (also after reopening the inspector, until the browser closes).
const jobId = computed(() => healthJobId(org.orgId, org.dataSpace))
const job = computed(() => (org.orgId ? useJob(jobId.value) : null))
const sections = computed(() => job.value?.result || [])
const loading = computed(() => job.value?.status === 'running')
const checkedAt = computed(() => (job.value?.finishedAt ? new Date(job.value.finishedAt) : null))

function load() {
  if (!org.version || !org.orgId) return
  const call = orgCall()
  const version = org.version
  startJob(jobId.value, (progress) => loadHealth(call, version, { onProgress: progress }))
}
// First visit: start a check unless one ran (or is running) for this org and data space.
function autoStart() {
  if (!org.version) return
  setTimeout(() => { if (job.value && job.value.status === 'idle' && !job.value.result) load() }, 150)
}
onMounted(autoStart)
watch(() => [org.orgId, org.version, org.dataSpace], autoStart)
watch(() => [job.value?.status, jobId.value], () => { if (job.value && job.value.status !== 'running') markSeen(jobId.value) }, { immediate: true })

const all = computed(() => sections.value.flatMap((s) => s.items))
const totals = computed(() => countLevels(all.value))
const itemCols = [
  { key: 'level', label: 'Status', value: (i) => LEVEL_TEXT[i.level], sortValue: (i) => LEVELS.indexOf(i.level), kind: 'number', headerClass: 'w-32' },
  { key: 'name', label: 'Name', value: (i) => `${i.label} ${i.details || ''}`, sortValue: (i) => i.label },
  { key: 'reason', label: 'Reason' },
  { key: 'lastRun', label: 'Last run', align: 'right', kind: 'date', headerClass: 'w-32', value: (i) => ago(i.lastRun), sortValue: (i) => i.lastRun || '' },
]
// Details per row (feedback #148): what the API says about the last run or publish, the
// error when it gives one, and a segment's publish history
const catalog = useCatalog()
const open = ref({}) // `${kind}:${name}` -> { loading, fields, error, history }
const keyOf = (i) => `${i.kind}:${i.name}`
async function toggleDetails(i) {
  const k = keyOf(i)
  if (open.value[k]) { const next = { ...open.value }; delete next[k]; open.value = next; return }
  const path = detailPath(i, org.version)
  open.value = { ...open.value, [k]: { loading: true, fields: [], error: '', history: null } }
  const d = open.value[k]
  if (!path) { Object.assign(d, { loading: false, error: 'No detail call for this kind of record.' }); return }
  const res = await orgCall()(path)
  if (!res.ok) { Object.assign(d, { loading: false, error: res.error || `HTTP ${res.status}` }); return }
  const rec = unwrap(res.data)
  d.fields = statusFields(rec).sort((a, b) => b.error - a.error)
  d.loading = false
  if (i.kind === 'Segment' && rec) {
    await ensureCatalog()
    const seg = normalizeSegment(rec)
    const t = membershipTables(seg, catalog.objects)
    d.history = t.history ? await publishHistory((sql) => runQuery(orgCall(), org.version, sql, { rowLimit: 2000 }), t.history, seg).catch(() => []) : []
  }
}

// Feedback #1001: the summary counts name nothing, so a count opens its section filtered to
// that status, and the problems are listed by name under the summary.
const levelFilter = ref(null) // { title, level } from a clicked count
const shown = (items, title) => items.filter((i) =>
  (levelFilter.value?.title === title ? i.level === levelFilter.value.level : true) &&
  (!problemsOnly.value || i.level === 'fail' || i.level === 'warn'))
const sectionId = (title) => `health-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
function showLevel(title, level) {
  levelFilter.value = { title, level }
  requestAnimationFrame(() => document.getElementById(sectionId(title))?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}
const attention = computed(() => sections.value
  .flatMap((s) => s.items.filter((i) => i.level === 'fail' || i.level === 'warn').map((i) => ({ ...i, area: s.title })))
  .sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level)))

// Where a row opens: our own page when there is one, else the record in Salesforce.
function inside(i) {
  if (i.kind === 'Data stream') return `/streams/${i.name}`
  if (i.kind === 'Calculated insight') return `/insights/${i.name}`
  if (i.kind === 'Segment') return `/segments/${i.name}`
  if (i.kind === 'Activation' && i.recordId) return `/activations/${i.recordId}`
  return null
}

const healthMd = () => healthMarkdown(sections.value, { host: orgTitle(org.orgId), at: checkedAt.value || new Date() })
const healthSheets = () => sections.value.map((s) => ({ name: s.title, columns: ['Status', 'Name', 'Why', 'Last run', 'Details'], rows: s.items.map((i) => [i.level, i.label, i.reason, i.lastRun || '', i.details || '']) }))

function ago(iso) {
  if (!iso) return 'never'
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000)
  if (Number.isNaN(mins)) return iso
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  if (mins < 48 * 60) return `${Math.round(mins / 60)} h ago`
  return `${Math.round(mins / 1440)} days ago`
}

const DOT = { fail: 'bg-red-500', warn: 'bg-amber-400', running: 'bg-sky-500', idle: 'bg-gray-400', ok: 'bg-green-500' }
const card = 'border rounded-md bg-card'
const btn = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-sm hover:bg-accent disabled:opacity-50'
</script>

<template>
  <section class="max-w-6xl mx-auto space-y-4">
    <div class="flex flex-wrap items-center gap-3">
      <div>
        <h2 class="text-lg font-semibold">Health <HelpTip topic="health" /></h2>
        <p class="text-sm text-muted-foreground">
          Data streams, identity resolution, calculated insights, segments and activations, problems first.
          <span v-if="loading"> Checking: {{ job?.progress || 'starting' }}. You can use other pages meanwhile.</span>
          <span v-else-if="checkedAt"> Checked {{ checkedAt.toLocaleString() }}.</span>
          <span v-if="job?.status === 'failed'" class="text-destructive"> The check failed: {{ job.error }}</span>
        </p>
      </div>
      <div class="ml-auto flex items-center gap-2">
        <label class="text-sm flex items-center gap-1.5"><input v-model="problemsOnly" type="checkbox" /> Problems only</label>
        <DownloadMenu :get-markdown="healthMd" :get-sheets="healthSheets" file-name="data-cloud-health" :disabled="loading || !sections.length" />
        <button :class="btn" :disabled="loading" @click="load"><RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" /> Check again</button>
      </div>
    </div>
    <p v-if="notice" class="text-sm text-muted-foreground">{{ notice }}</p>
    <Loading v-if="loading && !sections.length" text="Checking the org…" />

    <table v-if="sections.length" :class="[card, 'w-full text-sm']">
      <thead class="text-left text-muted-foreground border-b">
        <tr>
          <th class="p-2 font-normal">Area</th>
          <th v-for="l in LEVELS" :key="l" class="p-2 font-normal text-right">{{ LEVEL_TEXT[l] }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="s in sections" :key="s.title" class="border-b last:border-0">
          <td class="p-2">{{ s.title }}<span v-if="s.error" class="text-destructive text-xs ml-2">could not load</span><span v-else-if="s.notice" class="text-muted-foreground text-xs ml-2">not set up</span></td>
          <td v-for="l in LEVELS" :key="l" class="p-2 text-right" :class="{ 'font-semibold': (l === 'fail' || l === 'warn') && countLevels(s.items)[l] }">
            <button v-if="countLevels(s.items)[l]" class="text-link hover:underline" :title="`Show the ${LEVEL_TEXT[l].toLowerCase()} ${s.title.toLowerCase()}`" @click="showLevel(s.title, l)">{{ countLevels(s.items)[l] }}</button>
          </td>
        </tr>
        <tr class="text-muted-foreground">
          <td class="p-2">All</td>
          <td v-for="l in LEVELS" :key="l" class="p-2 text-right">{{ totals[l] || '' }}</td>
        </tr>
      </tbody>
    </table>

    <div v-if="attention.length" :class="card">
      <h3 class="p-3 border-b font-medium">Failed or needs a look <span class="text-muted-foreground font-normal text-sm">({{ attention.length }})</span></h3>
      <ul class="divide-y text-sm">
        <li v-for="i in attention" :key="`${i.area}:${i.name}`" class="p-2 px-3 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <span class="whitespace-nowrap w-28 shrink-0"><span :class="['inline-block w-2 h-2 rounded-full mr-2', DOT[i.level]]" />{{ LEVEL_TEXT[i.level] }}</span>
          <span class="text-muted-foreground w-36 shrink-0">{{ i.kind }}</span>
          <RouterLink v-if="inside(i)" :to="inside(i)" class="text-link hover:underline font-medium">{{ i.label }}</RouterLink>
          <span v-else class="font-medium">{{ i.label }}</span>
          <span class="text-muted-foreground">{{ i.reason }}</span>
        </li>
      </ul>
    </div>

    <div v-for="s in sections" :id="sectionId(s.title)" :key="s.title" :class="[card, 'scroll-mt-4']">
      <h3 class="p-3 border-b font-medium">{{ s.title }} <span class="text-muted-foreground font-normal text-sm">({{ s.items.length }})</span>
        <span v-if="levelFilter?.title === s.title" class="ml-2 text-xs font-normal text-muted-foreground">Showing {{ LEVEL_TEXT[levelFilter.level].toLowerCase() }} only. <button class="text-link hover:underline" @click="levelFilter = null">Show all</button></span>
      </h3>
      <p v-if="s.error" class="p-3 text-sm text-destructive">Could not load: {{ s.error }}</p>
      <p v-else-if="s.notice" class="p-3 text-sm text-muted-foreground">{{ s.notice }}</p>
      <p v-else-if="!s.items.length" class="p-3 text-sm text-muted-foreground">None in this org.</p>
      <p v-else-if="!shown(s.items, s.title).length" class="p-3 text-sm text-muted-foreground">No problems.</p>
      <DataTable v-else :columns="itemCols" :rows="shown(s.items, s.title)" row-key="name" :bordered="false">
        <template #cell-level="{ row: i }"><span class="whitespace-nowrap"><span :class="['inline-block w-2 h-2 rounded-full mr-2', DOT[i.level]]" />{{ LEVEL_TEXT[i.level] }}</span></template>
        <template #cell-name="{ row: i }">
          <RouterLink v-if="inside(i)" :to="inside(i)" class="text-link hover:underline">{{ i.label }}</RouterLink>
          <span v-else>{{ i.label }}</span>
          <a v-if="i.recordId" :href="recordUrl(currentOrg()?.host, i.recordId)" target="_blank" rel="noopener" class="ml-2 text-xs text-link hover:underline">Open in Salesforce</a>
          <div class="text-xs text-muted-foreground">{{ i.details }}</div>
          <button class="text-xs text-link hover:underline mr-2" :aria-expanded="!!open[keyOf(i)]" @click="toggleDetails(i)">{{ open[keyOf(i)] ? 'Hide details' : 'Details' }}</button>
          <button v-if="i.problems?.count" class="text-xs text-link hover:underline" @click="router.push({ path: '/sql', query: { sql: latestProblemsSql(i.problemDlo) } })">See the problem records in SQL</button>
        </template>
        <template #after-row="{ row: i, colspan }">
          <tr v-if="open[keyOf(i)]" class="bg-muted/30"><td :colspan="colspan" class="p-3 text-xs space-y-2">
            <p v-if="open[keyOf(i)].loading" class="text-muted-foreground">Reading the details…</p>
            <p v-else-if="open[keyOf(i)].error" class="text-destructive">Could not read the details: {{ open[keyOf(i)].error }}</p>
            <template v-else>
              <p v-if="!open[keyOf(i)].fields.some((f) => f.error)" class="text-muted-foreground">The API gives no error text for this {{ i.kind.toLowerCase() }}{{ i.level === 'fail' ? '; Salesforce shows the reason on the record page (Open in Salesforce)' : '' }}.</p>
              <dl class="grid grid-cols-[minmax(10rem,auto)_1fr] gap-x-3 gap-y-0.5">
                <template v-for="f in open[keyOf(i)].fields" :key="f.path"><dt class="font-mono text-muted-foreground">{{ f.path }}</dt><dd :class="f.error ? 'text-destructive' : ''">{{ f.value }}</dd></template>
              </dl>
            </template>
            <div v-if="open[keyOf(i)].history" class="space-y-1">
              <div class="font-medium">Publish history (from the membership history table; failed publishes leave no rows)</div>
              <p v-if="!open[keyOf(i)].history.length" class="text-muted-foreground">No publishes recorded.</p>
              <table v-else class="text-xs"><thead class="text-muted-foreground"><tr><th class="pr-4 text-left font-normal">Published</th><th class="pr-4 text-right font-normal">Rows</th><th class="text-right font-normal">Members</th></tr></thead>
                <tbody><tr v-for="v in open[keyOf(i)].history.slice(0, 15)" :key="v.version"><td class="pr-4">{{ v.at ? new Date(v.at).toLocaleString() : v.version }}</td><td class="pr-4 text-right">{{ v.members.toLocaleString() }}</td><td class="text-right">{{ v.size != null ? v.size.toLocaleString() : '' }}</td></tr></tbody></table>
              <RouterLink :to="`/segments/${i.name}`" class="text-link hover:underline">All publishes on the segment page</RouterLink>
            </div>
          </td></tr>
        </template>
        <template #cell-lastRun="{ row: i }"><span class="whitespace-nowrap" :title="i.lastRun ? new Date(i.lastRun).toLocaleString() : ''">{{ ago(i.lastRun) }}</span></template>
      </DataTable>
    </div>
  </section>
</template>
