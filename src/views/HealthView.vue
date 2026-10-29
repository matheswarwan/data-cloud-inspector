<script setup>
import PageHeader from '../components/PageHeader.vue'
import DownloadMenu from '../components/DownloadMenu.vue'
import Loading from '../components/Loading.vue'
import HelpTip from '../components/HelpTip.vue'
import DataTable from '../components/DataTable.vue'
import { ref, computed, watch, onMounted } from 'vue'
import { Activity, AlertCircle, AlertTriangle, Check, CheckCheck, CheckCircle2, CircleSlash, Clock, Copy, Database, ExternalLink, Fingerprint, Info, MessageSquare, RefreshCw, Send, Sigma, Users, X } from 'lucide-vue-next'
import { itemKey, problemGroups, areaTiles, healthScore, headline, okBreakdown, ageScale, healthChanges, levelMap, reasonStatus } from '../lib/healthView.js'
import { useOrg, currentOrg, orgName, orgTitle } from '../app/useOrg.js'
import { orgCall, useCatalog, ensureCatalog } from '../app/useCatalog.js'
import { runQuery } from '../lib/query.js'
import { detailPath, unwrap, statusFields } from '../lib/healthDetails.js'
import { normalizeSegment, membershipTables, publishHistory } from '../lib/segments.js'
import { useJob, startJob, markSeen } from '../app/useJobs.js'
import { healthJobId } from '../app/usePreload.js'
import { recordUrl } from '../lib/links.js'
import { healthSectionListed } from '../lib/optionalPages.js'
import { loadHealth, countLevels, healthMarkdown, sectionMarkdown, problemItems, LEVELS, LEVEL_TEXT } from '../lib/health.js'
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
// Sections of pages turned off in Settings > Pages stay hidden, also in a result checked earlier.
const sections = computed(() => (job.value?.result || []).filter((s) => healthSectionListed(s.title)))
const loading = computed(() => job.value?.status === 'running')
const checkedAt = computed(() => (job.value?.finishedAt ? new Date(job.value.finishedAt) : null))

function load() {
  if (!org.version || !org.orgId) return
  const call = orgCall()
  const version = org.version
  startJob(jobId.value, (progress) => loadHealth(call, version, { onProgress: progress, objects: () => ensureCatalog().then(() => useCatalog().objects) }))
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

// Copy or download one section (feedback #1044): its failed and needs-a-look items, or the rows
// shown (after Problems only and a clicked count), to share on their own.
const copied = ref('')
async function copySection(title, items, which) {
  await navigator.clipboard.writeText(sectionMarkdown(title, items, { host: orgTitle(org.orgId), at: checkedAt.value || new Date(), which }))
  copied.value = `${title}|${which}`
  setTimeout(() => { if (copied.value === `${title}|${which}`) copied.value = '' }, 1500)
}
const shownWhich = (title) => (levelFilter.value?.title === title ? LEVEL_TEXT[levelFilter.value.level].toLowerCase() + ' only' : problemsOnly.value ? 'problems only' : '')
const sectionMd = (title, items) => () => sectionMarkdown(title, items, { host: orgTitle(org.orgId), at: checkedAt.value || new Date(), which: shownWhich(title) })
const sectionSheets = (title, items) => () => [{ name: title.slice(0, 31), columns: ['Status', 'Name', 'Why', 'Last run', 'Details'], rows: items.map((i) => [LEVEL_TEXT[i.level], i.label, i.reason, i.lastRun || '', i.details || '']) }]
const fileFor = (title) => `data-cloud-health-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

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

// The page in design Option D: Problems (grouped) or Everything (every item per area), one
// area at a time from its tile, items marked as expected, and changes since the last check.
const mode = ref('problems')
const area = ref('')
const groupOpen = ref({})
const showExpected = ref(false)
const expectedKey = () => `dci_health_expected_${org.orgId}`
const expected = ref(new Set())
function loadExpected() {
  try { expected.value = new Set(JSON.parse(localStorage.getItem(expectedKey()) || '[]')) } catch { expected.value = new Set() }
}
function saveExpected(next) {
  expected.value = next
  try { localStorage.setItem(expectedKey(), JSON.stringify([...next])) } catch { /* private window */ }
}
const markExpected = (items) => saveExpected(new Set([...expected.value, ...items.map(itemKey)]))
const unmark = (key) => { const next = new Set(expected.value); next.delete(key); saveExpected(next) }
const unmarkAll = () => { saveExpected(new Set()); showExpected.value = false }
watch(() => org.orgId, loadExpected, { immediate: true })
const expectedItems = computed(() => all.value.filter((i) => expected.value.has(itemKey(i))))

const score = computed(() => healthScore(sections.value, expected.value))
const tiles = computed(() => areaTiles(sections.value, expected.value))
const groups = computed(() => problemGroups(sections.value, expected.value))
const shownGroups = computed(() => groups.value.filter((g) => !area.value || g.area === area.value || (g.level === 'idle' && g.items.some((i) => i.area === area.value))).map((g) => (area.value && g.level === 'idle' ? { ...g, items: g.items.filter((i) => i.area === area.value) } : g)))
const shownSections = computed(() => sections.value.filter((s) => !area.value || s.title === area.value))
const okCount = computed(() => score.value.counts.ok || 0)
const okLine = computed(() => okBreakdown(area.value ? shownSections.value : sections.value, expected.value))
const freshEngagement = computed(() => (sections.value.find((s) => s.title === 'Engagement data')?.items || []).filter((i) => i.level === 'ok').sort((a, b) => String(b.lastRun).localeCompare(String(a.lastRun))))

// Compared with the check before (this browser): new problems get a "new" badge.
const seenKey = () => `dci_health_seen_${org.orgId}_${org.dataSpace || 'default'}`
const baseline = ref(null)
watch([checkedAt, () => org.orgId], () => {
  baseline.value = null
  if (!checkedAt.value || !sections.value.length) return
  const at = checkedAt.value.getTime()
  let stored = null
  try { stored = JSON.parse(localStorage.getItem(seenKey()) || 'null') } catch { /* none */ }
  if (stored?.at === at) { baseline.value = stored.prev || null; return }
  baseline.value = stored ? { at: stored.at, levels: stored.levels } : null
  try { localStorage.setItem(seenKey(), JSON.stringify({ at, levels: levelMap(job.value?.result || []), prev: baseline.value })) } catch { /* full or private */ }
}, { immediate: true })
const changes = computed(() => healthChanges(baseline.value?.levels, sections.value))
const newIn = (g) => g.items.filter((i) => changes.value.newProblems.has(itemKey(i))).length

// Engagement freshness on a 1 hour to 1 year scale, the 7-day line marked.
const AGE_MARKS = [['1 h', 1], ['1 day', 24], ['7 days', 168], ['30 days', 720], ['1 year', 8760]].map(([label, h]) => ({ label, x: ageScale(h) }))
const AGE_LINE = ageScale(168)
function staleBar(i) {
  const x = ageScale((Date.now() - Date.parse(i.lastRun)) / 3600000)
  const ok = x ? Math.min(100, (AGE_LINE / x) * 100) : 100
  return { width: `${Math.max(2, x * 100)}%`, background: `linear-gradient(90deg, rgb(22 163 74) 0, rgb(22 163 74) ${ok}%, rgb(245 158 11) ${ok}%, rgb(245 158 11) 100%)` }
}
const ringStyle = computed(() => {
  const c = score.value.counts
  const t = score.value.total || 1
  const p = (n) => ((n || 0) / t) * 100
  const a = p(c.fail), b = a + p(c.warn), d = b + p(c.idle) + p(c.running)
  return { background: `conic-gradient(rgb(220 38 38) 0 ${a}%, rgb(245 158 11) ${a}% ${b}%, rgb(156 163 175) ${b}% ${d}%, rgb(22 163 74) ${d}% 100%)` }
})
const COUNT_WORD = { fail: 'failed', warn: 'need a look', idle: 'inactive', running: 'running', ok: 'OK' }
const AREA_ICON = { 'Data streams': Database, 'Identity resolution': Fingerprint, 'Calculated insights': Sigma, Segments: Users, Activations: Send, 'Engagement data': MessageSquare }
const AREA_TONE = {
  'Data streams': 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  'Identity resolution': 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  'Calculated insights': 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  Segments: 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
  Activations: 'bg-pink-50 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300',
  'Engagement data': 'bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
}
const AREA_PAGE = { 'Data streams': '/streams', 'Calculated insights': '/insights', Segments: '/segments', Activations: '/activations' }

const DOT = { fail: 'bg-red-500', warn: 'bg-amber-400', running: 'bg-sky-500', idle: 'bg-gray-400', ok: 'bg-green-500' }
const card = 'dci-card'
const btn = 'dci-btn'
</script>

<template>
  <section class="max-w-[1180px] mx-auto space-y-5">
    <PageHeader path="/health" title="Health" topic="health">Data streams, identity resolution, calculated insights, segments and activations, problems first.
      <template #actions>
        <DownloadMenu :get-markdown="healthMd" :get-sheets="healthSheets" file-name="data-cloud-health" :disabled="loading || !sections.length" />
      </template>
    </PageHeader>
    <p v-if="job?.status === 'failed'" class="text-sm text-destructive">The check failed: {{ job.error }}</p>
    <Loading v-if="loading && !sections.length" :text="`Checking the org: ${job?.progress || 'starting'}`" />

    <template v-if="sections.length">
      <!-- Score -->
      <section :class="['dci-card relative overflow-hidden px-[22px] py-5 flex flex-wrap items-center gap-[22px]', score.counts.fail ? 'shadow-[0_14px_32px_-22px_rgba(220,38,38,0.5)]' : '']">
        <div aria-hidden="true" :class="['absolute -top-[60px] left-20 w-[480px] max-w-[70%] h-[150px] rounded-full blur-[46px] pointer-events-none', score.counts.fail ? 'bg-red-500/10' : score.counts.warn ? 'bg-amber-500/10' : 'bg-green-500/10']" />
        <span class="relative w-24 h-24 shrink-0 rounded-full flex items-center justify-center" :style="ringStyle" role="img" :aria-label="`${Math.round(score.ok * 100)}% OK`">
          <span class="w-[68px] h-[68px] rounded-full bg-card flex flex-col items-center justify-center"><span class="text-lg font-bold leading-5">{{ Math.floor(score.ok * 100) }}%</span><span class="text-[10px] text-muted-foreground">OK</span></span>
        </span>
        <div class="relative flex-[1_1_420px] min-w-0 flex flex-col gap-2.5">
          <span class="text-xl font-bold tracking-tight">{{ headline(score.counts) }}</span>
          <div class="flex flex-wrap gap-4 text-sm">
            <span v-for="l in ['fail', 'warn', 'idle', 'running', 'ok']" v-show="score.counts[l] || l === 'ok'" :key="l" class="inline-flex items-center gap-1.5"><span :class="['w-2.5 h-2.5 rounded-full', DOT[l]]" /><b>{{ (score.counts[l] || 0).toLocaleString() }}</b><span class="text-muted-foreground">{{ COUNT_WORD[l] }}</span></span>
            <span class="text-muted-foreground">of {{ score.total.toLocaleString() }} checks</span>
          </div>
          <span class="inline-flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Clock class="w-3.5 h-3.5" aria-hidden="true" />
            <template v-if="loading">Checking: {{ job?.progress || 'starting' }}. You can use other pages meanwhile.</template>
            <template v-else-if="checkedAt">Checked {{ checkedAt.toLocaleString() }} ·
              <template v-if="!baseline">First check in this browser; next time you'll see what changed since.</template>
              <template v-else-if="changes.newProblems.size || changes.fixed">Since {{ new Date(baseline.at).toLocaleString() }}: <b class="text-foreground">{{ changes.newProblems.size }} new problem{{ changes.newProblems.size === 1 ? '' : 's' }}</b>, {{ changes.fixed }} fixed.</template>
              <template v-else>No change since {{ new Date(baseline.at).toLocaleString() }}.</template>
            </template>
            <template v-if="score.expected"> · {{ score.expected }} marked as expected <button type="button" class="text-link hover:underline" @click="showExpected = !showExpected">{{ showExpected ? 'Hide' : 'Show' }}</button></template>
          </span>
        </div>
        <div class="relative flex flex-col items-end gap-2.5">
          <button class="dci-btn-primary" :disabled="loading" @click="load"><RefreshCw :class="['w-4 h-4', loading ? 'animate-spin' : '']" /> Check again</button>
          <div role="group" aria-label="Show" class="inline-flex p-[3px] rounded-full border bg-card">
            <button v-for="m in [['problems', 'Problems'], ['all', 'Everything']]" :key="m[0]" type="button" :class="['h-[30px] px-3 rounded-full text-[13px]', mode === m[0] ? 'bg-primary text-primary-foreground font-semibold' : 'font-medium hover:bg-accent']" :aria-pressed="mode === m[0]" @click="mode = m[0]">{{ m[1] }}</button>
          </div>
        </div>
      </section>

      <!-- Marked as expected -->
      <section v-if="showExpected && expectedItems.length" class="dci-card px-5 py-4 space-y-2">
        <div class="flex items-center justify-between gap-2"><h2 class="text-base font-semibold">Marked as expected <span class="dci-count">{{ expectedItems.length }}</span></h2><button type="button" class="dci-btn dci-btn-sm" @click="unmarkAll">Unmark all</button></div>
        <p class="text-xs text-muted-foreground">They count as OK and stay out of the problems, in this browser only.</p>
        <div class="flex flex-wrap gap-1.5">
          <span v-for="i in expectedItems" :key="itemKey(i)" class="inline-flex items-center gap-1.5 text-[13px] px-2.5 py-1 rounded-full border">{{ i.label }} <span class="text-muted-foreground text-xs">{{ i.kind }}</span><button type="button" class="text-muted-foreground hover:text-foreground" :aria-label="`Unmark ${i.label}`" @click="unmark(itemKey(i))"><X class="w-3 h-3" /></button></span>
        </div>
      </section>

      <!-- Area tiles -->
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        <button v-for="t in tiles" :key="t.title" type="button" :aria-pressed="area === t.title" :class="['text-left p-4 rounded-[14px] flex flex-col gap-2.5 min-w-0 transition-colors', area === t.title ? 'border-2 border-primary bg-primary/5' : t.worst === 'fail' ? 'border border-red-200 dark:border-red-500/40 bg-card shadow-[0_10px_24px_-18px_rgba(220,38,38,0.6)]' : t.worst === 'warn' ? 'border border-amber-200 dark:border-amber-500/40 bg-card' : 'border bg-card']" @click="area = area === t.title ? '' : t.title">
          <span class="flex items-center justify-between gap-2 w-full">
            <span :class="['w-8 h-8 rounded-xl flex items-center justify-center', AREA_TONE[t.title] || 'bg-muted text-muted-foreground']" aria-hidden="true"><component :is="AREA_ICON[t.title] || Activity" class="w-4 h-4" /></span>
            <span :class="['dci-badge', t.worst === 'fail' ? 'dci-badge-red' : t.worst === 'warn' ? 'dci-badge-amber' : t.worst === 'ok' ? 'dci-badge-green' : '']">{{ t.label }}</span>
          </span>
          <span class="text-[15px] font-bold">{{ t.title }}</span>
          <span v-if="t.total" class="flex flex-col gap-2 w-full">
            <span class="flex h-2 rounded overflow-hidden gap-0.5"><span v-for="l in ['fail', 'warn', 'running', 'idle', 'ok']" v-show="t.counts[l]" :key="l" :class="DOT[l]" :style="{ width: `${(t.counts[l] / t.total) * 100}%`, minWidth: '3px' }" /></span>
            <span class="flex flex-wrap gap-2.5 text-xs"><span v-for="l in ['fail', 'warn', 'running', 'idle', 'ok']" v-show="t.counts[l]" :key="l" class="inline-flex items-center gap-1"><span :class="['w-[7px] h-[7px] rounded-full', DOT[l]]" /><b>{{ t.counts[l].toLocaleString() }}</b>{{ COUNT_WORD[l] }}</span></span>
          </span>
          <span v-else class="inline-flex items-center gap-1.5 text-xs text-muted-foreground px-2.5 py-1.5 rounded-lg bg-muted"><Info class="w-3.5 h-3.5" aria-hidden="true" />{{ t.note }}</span>
        </button>
      </div>
      <p v-if="area" class="text-sm text-muted-foreground">Showing <b class="text-foreground">{{ area }}</b> only. <button type="button" class="text-link hover:underline" @click="area = ''">Show all areas</button></p>

      <!-- Problems, in groups -->
      <template v-if="mode === 'problems'">
        <p v-if="!shownGroups.length" class="dci-card px-5 py-4 text-sm text-muted-foreground">No problems{{ area ? ` in ${area}` : '' }}.</p>
        <section v-for="g in shownGroups" :key="g.id" :class="['dci-card overflow-hidden border-l-4', g.level === 'fail' ? '!border-l-red-600' : g.level === 'warn' ? '!border-l-amber-500' : '!border-l-gray-400']">
          <div class="px-5 py-3.5 border-b flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-3 min-w-0">
              <component :is="g.level === 'fail' ? AlertCircle : g.level === 'warn' ? AlertTriangle : CircleSlash" :class="['w-5 h-5 shrink-0', g.level === 'fail' ? 'text-red-600' : g.level === 'warn' ? 'text-amber-500' : 'text-muted-foreground']" aria-hidden="true" />
              <div class="flex flex-col gap-0.5 min-w-0">
                <h2 class="text-base font-bold flex items-center gap-2">{{ g.title }} <span class="dci-count">{{ g.items.length }}</span><span v-if="newIn(g)" class="dci-badge dci-badge-blue">{{ newIn(g) }} new</span></h2>
                <span v-if="g.note" class="text-xs text-muted-foreground">{{ g.note }}</span>
              </div>
            </div>
            <div class="flex flex-wrap gap-1.5">
              <RouterLink v-if="g.layout === 'chips' && AREA_PAGE[g.area]" :to="AREA_PAGE[g.area]" class="dci-btn dci-btn-sm">Open in {{ g.area }}</RouterLink>
              <button v-if="g.level !== 'fail'" type="button" class="dci-btn dci-btn-sm" :title="`Mark these ${g.items.length} as expected so they stop counting (this browser only)`" @click="markExpected(g.items)"><CheckCheck class="w-3.5 h-3.5" /> Mark as expected</button>
              <button type="button" class="dci-btn dci-btn-sm" title="Copy as a Markdown table" @click="copySection(g.title, g.items.map((i) => ({ ...i, label: g.level === 'idle' ? `${i.area}: ${i.label}` : i.label })), '')"><component :is="copied === `${g.title}|` ? Check : Copy" class="w-3.5 h-3.5" /> {{ copied === `${g.title}|` ? 'Copied' : 'Copy' }}</button>
            </div>
          </div>

          <!-- Numbered rows -->
          <div v-if="g.layout === 'list'" class="px-5 py-3.5">
            <div v-for="(i, n) in g.items" :key="itemKey(i)" :class="['py-2.5', n ? 'border-t' : '']">
              <div class="grid grid-cols-[26px_minmax(0,1fr)_auto] gap-3 items-center">
                <span :class="['w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center', g.level === 'fail' ? 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300' : 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300']">{{ n + 1 }}</span>
                <div class="flex flex-col gap-1 min-w-0">
                  <span class="flex flex-wrap items-center gap-2">
                    <RouterLink v-if="inside(i)" :to="inside(i)" class="text-sm font-semibold text-link hover:underline break-all">{{ i.label }}</RouterLink>
                    <span v-else class="text-sm font-semibold break-all">{{ i.label }}</span>
                    <span v-if="changes.newProblems.has(itemKey(i))" class="dci-badge dci-badge-blue">new</span>
                  </span>
                  <span class="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <template v-if="reasonStatus(i.reason)">{{ i.reason.split(':')[0] }} <span :class="['dci-badge', g.level === 'fail' ? 'dci-badge-red' : 'dci-badge-amber']">{{ reasonStatus(i.reason) }}</span></template>
                    <template v-else>{{ i.reason }}</template>
                    <template v-if="i.details"> · {{ i.details }}</template>
                    <template v-if="i.lastRun"> · {{ ago(i.lastRun) }}</template>
                  </span>
                  <span class="flex flex-wrap gap-3 text-xs">
                    <button type="button" class="text-link hover:underline" :aria-expanded="!!open[keyOf(i)]" @click="toggleDetails(i)">{{ open[keyOf(i)] ? 'Hide details' : 'Details' }}</button>
                    <button v-if="i.problems?.count" type="button" class="text-link hover:underline" @click="router.push({ path: '/sql', query: { sql: latestProblemsSql(i.problemDlo) } })">See the problem records in SQL</button>
                    <button v-if="g.level !== 'fail'" type="button" class="text-link hover:underline" @click="markExpected([i])">Mark as expected</button>
                  </span>
                </div>
                <a v-if="i.recordId" :href="recordUrl(currentOrg()?.host, i.recordId)" target="_blank" rel="noopener" class="text-[13px] font-semibold text-link hover:underline whitespace-nowrap inline-flex items-center gap-1">Open in Salesforce <ExternalLink class="w-3.5 h-3.5" aria-hidden="true" /></a>
              </div>
              <div v-if="open[keyOf(i)]" class="mt-2 ml-[38px] p-3 rounded-lg bg-muted/40 text-xs space-y-2">
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
                </div>
              </div>
            </div>
            <div v-if="g.hint" class="mt-2.5 flex gap-2.5 items-start px-3 py-2.5 rounded-[10px] bg-muted/50 text-[13px]"><Info class="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" /><span><b>{{ g.hint.word }}</b> {{ g.hint.text }}</span></div>
          </div>

          <!-- Many names -->
          <div v-else-if="g.layout === 'chips'" class="px-5 py-3.5">
            <div class="flex flex-wrap gap-1.5">
              <component :is="inside(i) ? 'RouterLink' : 'span'" v-for="i in (groupOpen[g.id] ? g.items : g.items.slice(0, 24))" :key="itemKey(i)" :to="inside(i) || undefined" :title="[i.reason, i.details].filter(Boolean).join(' · ')" class="text-[13px] px-2.5 py-1 rounded-full border border-amber-200 bg-amber-50/60 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 hover:underline">{{ i.label }}<span v-if="changes.newProblems.has(itemKey(i))" class="ml-1 text-[11px] font-semibold text-sky-700 dark:text-sky-300">new</span></component>
            </div>
            <button v-if="g.items.length > 24" type="button" class="mt-3 text-[13px] font-semibold text-link hover:underline" @click="groupOpen = { ...groupOpen, [g.id]: !groupOpen[g.id] }">{{ groupOpen[g.id] ? 'Show fewer' : `Show all ${g.items.length}` }}</button>
          </div>

          <!-- Time since the newest row -->
          <div v-else-if="g.layout === 'stale'" class="px-5 py-3.5">
            <div class="grid grid-cols-[minmax(0,240px)_minmax(0,1fr)_110px] gap-4 max-sm:hidden">
              <span />
              <div class="relative h-4 text-[11px] text-muted-foreground">
                <span v-for="m in AGE_MARKS" :key="m.label" class="absolute whitespace-nowrap" :class="m.label === '7 days' ? 'font-bold text-foreground' : ''" :style="{ left: `${m.x * 100}%`, transform: m.x === 0 ? 'none' : m.x === 1 ? 'translateX(-100%)' : 'translateX(-50%)' }">{{ m.label }}</span>
              </div>
              <span />
            </div>
            <div v-for="i in g.items" :key="itemKey(i)" class="grid grid-cols-1 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)_110px] gap-x-4 gap-y-1.5 items-center py-2.5 border-t">
              <div class="flex flex-col gap-0.5 min-w-0">
                <span class="flex flex-wrap items-center gap-1.5"><span class="text-sm font-semibold">{{ i.label }}</span><span v-if="!i.lastRun" class="dci-badge dci-badge-amber">Never loaded</span><span v-if="changes.newProblems.has(itemKey(i))" class="dci-badge dci-badge-blue">new</span></span>
                <code v-if="i.details" class="font-mono text-[11px] text-muted-foreground break-all">{{ i.details }}</code>
              </div>
              <div class="flex flex-col gap-1.5">
                <div class="relative h-2.5 rounded-full bg-muted">
                  <div v-if="i.lastRun" class="absolute left-0 top-0 bottom-0 rounded-full" :style="staleBar(i)" />
                  <span class="absolute top-[-4px] bottom-[-4px] border-l-2 border-foreground" :style="{ left: `${AGE_LINE * 100}%` }" aria-hidden="true" />
                </div>
                <span class="text-xs">{{ i.reason }}</span>
              </div>
              <span class="text-[13px] font-semibold sm:text-right whitespace-nowrap">{{ ago(i.lastRun) }}</span>
            </div>
            <div v-if="freshEngagement.length" class="mt-3 pt-3 border-t flex flex-col gap-2">
              <span class="text-xs font-semibold">{{ freshEngagement.length }} fresh in the last week</span>
              <div class="flex flex-wrap gap-1.5"><span v-for="i in freshEngagement" :key="itemKey(i)" class="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-green-50 text-green-800 dark:bg-green-500/10 dark:text-green-300">{{ i.label }} <b>{{ ago(i.lastRun).replace(' ago', '') }}</b></span></div>
            </div>
          </div>

          <!-- Inactive -->
          <div v-else class="px-5 py-3.5 flex flex-wrap gap-1.5">
            <component :is="inside(i) ? 'RouterLink' : 'span'" v-for="i in g.items" :key="itemKey(i)" :to="inside(i) || undefined" :title="i.reason" class="text-[13px] px-2.5 py-1 rounded-full border bg-muted/40 hover:underline">{{ i.label }} <span class="text-[11px] text-muted-foreground">{{ i.kind.toLowerCase() }}</span></component>
          </div>
        </section>
        <p v-if="okLine" class="text-center text-[13px] text-muted-foreground"><CheckCircle2 class="w-4 h-4 inline -mt-0.5 text-green-600" aria-hidden="true" /> <b class="text-foreground">{{ okCount.toLocaleString() }} OK</b>: {{ okLine }}. <button type="button" class="text-link hover:underline" @click="mode = 'all'">See everything</button></p>
      </template>

      <!-- Everything: every item per area -->
      <template v-else>
        <div v-for="s in shownSections" :id="sectionId(s.title)" :key="s.title" :class="[card, 'scroll-mt-4']">
          <h3 class="px-5 py-3 border-b text-base font-semibold flex flex-wrap items-center gap-x-2 gap-y-1">{{ s.title }} <span class="text-muted-foreground font-normal text-sm">({{ s.items.length }})</span>
            <span v-if="levelFilter?.title === s.title" class="text-xs font-normal text-muted-foreground">Showing {{ LEVEL_TEXT[levelFilter.level].toLowerCase() }} only. <button class="text-link hover:underline" @click="levelFilter = null">Show all</button></span>
            <span v-if="s.items.length" class="ml-auto flex flex-wrap items-center gap-2 font-normal">
              <button v-if="problemItems(s.items).length" class="dci-btn dci-btn-sm" :title="`Copy the ${problemItems(s.items).length} failed or needs-a-look ${s.title.toLowerCase()} as a Markdown table`" @click="copySection(s.title, problemItems(s.items), 'failed or needs a look')">
                <component :is="copied === `${s.title}|failed or needs a look` ? Check : Copy" class="w-3.5 h-3.5" /> {{ copied === `${s.title}|failed or needs a look` ? 'Copied' : `Copy failed and needs a look (${problemItems(s.items).length})` }}
              </button>
              <button class="dci-btn dci-btn-sm" title="Copy every row of this section as a Markdown table" @click="copySection(s.title, s.items, '')"><component :is="copied === `${s.title}|` ? Check : Copy" class="w-3.5 h-3.5" /> {{ copied === `${s.title}|` ? 'Copied' : 'Copy all' }}</button>
              <DownloadMenu small :get-markdown="sectionMd(s.title, shown(s.items, s.title))" :get-sheets="sectionSheets(s.title, shown(s.items, s.title))" :file-name="fileFor(s.title)" />
            </span>
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
      </template>
    </template>
  </section>
</template>
