<script setup>
import PageHeader from '../components/PageHeader.vue'
import DownloadMenu from '../components/DownloadMenu.vue'
import HelpTip from '../components/HelpTip.vue'
import DataTable from '../components/DataTable.vue'
import { ref, computed, watch, onMounted } from 'vue'
import { useOrg } from '../app/useOrg.js'
import { useCatalog, ensureCatalog, orgCall, cachedRulesets } from '../app/useCatalog.js'
import { useJob, startJob, markSeen } from '../app/useJobs.js'
import { runQuery } from '../lib/query.js'
import { inSpace } from '../lib/dataSpace.js'
import { parseRulesets } from '../lib/profile.js'
import { loadSegments, membershipTables } from '../lib/segments.js'
import { samplesSql, samplesFrom } from '../lib/samples.js'
import { kindCounts, lookupTargets, parseInputs, bulkLookup, bulkSummary, bulkCsv, MAX_INPUTS } from '../lib/bulkLookup.js'

const org = useOrg()
const catalog = useCatalog()
const text = ref('')
const rulesetId = ref('')
const segmentName = ref('')
const rulesets = ref([])
const segments = ref([])
const show = ref('all')
const notice = ref('')

const q = async (sql) => runQuery(orgCall(), org.version, sql, { rowLimit: 2000 })

async function loadChoices() {
  if (!org.version) return
  ensureCatalog()
  rulesets.value = await cachedRulesets(async () => {
    const res = await orgCall()(`/services/data/v${org.version}/ssot/identity-resolutions`)
    if (!res.ok) throw new Error(res.error || `HTTP ${res.status}`)
    return parseRulesets(inSpace(res.data?.identityResolutions, org.dataSpace))
  }).catch(() => [])
  if (!rulesetId.value) rulesetId.value = rulesets.value[0]?.id || ''
  segments.value = await loadSegments(orgCall(), org.version).catch(() => [])
}
onMounted(loadChoices)
watch(() => [org.orgId, org.version, org.dataSpace], loadChoices)

// Runs as a background job (per org and data space): leave the page and come back.
const jobId = computed(() => `bulk:${org.orgId}:${org.dataSpace || 'default'}`)
const job = computed(() => (org.orgId ? useJob(jobId.value) : null))
watch(() => [job.value?.status, jobId.value], () => { if (job.value && job.value.status !== 'running') markSeen(jobId.value) }, { immediate: true })
watch(() => job.value?.params, (p) => { if (p && !text.value) { text.value = p.text; rulesetId.value = p.rulesetId; segmentName.value = p.segment || '' } }, { immediate: true })

// What the values are (feedback #120): detected, or chosen, including a field you pick.
const valuesAs = ref('auto')
const fieldObject = ref('ssot__Individual__dlm')
const fieldName = ref('')
const targets = computed(() => lookupTargets(catalog.objects))
const target = computed(() => targets.value.find((t) => t.object === fieldObject.value) || null)
const items = computed(() => parseInputs(text.value, { as: valuesAs.value }))
const KIND_WORDS = { email: ['email', 'emails'], phone: ['phone', 'phones'], id: ['ID', 'IDs'], field: ['value', 'values'], unknown: ['not recognised', 'not recognised'] }
const detected = computed(() => Object.entries(kindCounts(items.value)).map(([k, n]) => `${n.toLocaleString()} ${KIND_WORDS[k]?.[n === 1 ? 0 : 1] || k}`).join(', '))
// "and N more" opens the rest (feedback #118)
const expanded = ref(new Set())
const toggleMore = (key) => { const s = new Set(expanded.value); s.has(key) ? s.delete(key) : s.add(key); expanded.value = s }
const upTo = (list, key) => (expanded.value.has(key) ? list : list.slice(0, 3))
const tooMany = computed(() => items.value.length > MAX_INPUTS)

// An empty box offers 10 random people to try (feedback #105).
const sampling = ref(false)
async function useSamples() {
  if (!org.version) return
  sampling.value = true
  try {
    await ensureCatalog()
    const sql = samplesSql(catalog.objects.map((o) => o.name))
    const list = sql ? samplesFrom(await runQuery(orgCall(), org.version, sql, { rowLimit: 10 })) : []
    text.value = list.map((x) => x.value).join('\n')
  } finally {
    sampling.value = false
  }
}

async function run() {
  await ensureCatalog()
  const ruleset = rulesets.value.find((r) => r.id === rulesetId.value) || null
  const segment = segments.value.find((s) => s.apiName === segmentName.value) || null
  const latestTable = segment ? membershipTables(segment, catalog.objects).latest : null
  const list = items.value.slice(0, MAX_INPUTS)
  const objects = catalog.objects
  const field = valuesAs.value === 'field' && target.value && fieldName.value ? { object: target.value.object, field: fieldName.value, link: target.value.link } : null
  expanded.value = new Set()
  startJob(jobId.value, (progress) => bulkLookup(q, list, { ruleset, segment, catalog: objects, latestTable, field, progress }), {
    params: { text: text.value, rulesetId: rulesetId.value, segment: segmentName.value, segmentLabel: segment?.label || '' },
  })
}

const rows = computed(() => job.value?.result || [])
const summary = computed(() => bulkSummary(rows.value))
const ran = computed(() => job.value?.params || {})
const FILTERS = [
  ['all', 'All', () => true],
  ['found', 'Found', (r) => r.sourceIds.length],
  ['notFound', 'Not found', (r) => r.kind !== 'unknown' && !r.sourceIds.length],
  ['several', 'In several profiles', (r) => r.unifiedIds.length > 1],
  ['member', 'In the segment', (r) => r.member === true],
  ['notMember', 'Not in the segment', (r) => r.member === false],
  ['unknown', 'Not an email, phone or ID', (r) => r.kind === 'unknown'],
]
const bulkCols = computed(() => [
  { key: 'input', label: 'Input', value: (r) => `${r.input} ${r.kind}`, sortValue: (r) => r.input },
  { key: 'sources', label: 'Source records', value: (r) => r.sourceIds, sortValue: (r) => r.sourceIds.length, kind: 'number' },
  { key: 'unified', label: 'Unified profile', value: (r) => r.unifiedIds, sortValue: (r) => r.unifiedIds.length, kind: 'number' },
  ...(ran.value.segment ? [
    { key: 'member', label: 'In segment', value: (r) => yn(r.member) },
    { key: 'matchesNow', label: 'Matches now', value: (r) => yn(r.matchesNow) },
  ] : []),
  { key: 'note', label: 'Note', value: (r) => `${r.note || ''}${r.unifiedIds.length > 1 ? `${r.note ? '; ' : ''}in ${r.unifiedIds.length} profiles` : ''}` },
])
const shown = computed(() => rows.value.filter(FILTERS.find((f) => f[0] === show.value)[2]))

function download() {
  const url = URL.createObjectURL(new Blob([bulkCsv(rows.value, { segment: ran.value.segment })], { type: 'text/csv' }))
  Object.assign(document.createElement('a'), { href: url, download: `bulk-lookup-${new Date().toISOString().slice(0, 10)}.csv` }).click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function bulkMarkdown() {
  const yn = (v) => (v == null ? '' : v ? 'yes' : 'no')
  const s = summary.value
  const head = `| Input | Found | Unified profiles |${ran.value.segment ? ' In segment | Matches now |' : ''} Note |`
  const sep = `| --- | --- | --- |${ran.value.segment ? ' --- | --- |' : ''} --- |`
  const body = shown.value.map((r) => `| ${r.input} | ${r.sourceIds.length} | ${r.unifiedIds.length} |${ran.value.segment ? ` ${yn(r.member)} | ${yn(r.matchesNow)} |` : ''} ${r.note} |`)
  return [`# Bulk lookup`, '', `${s.total} checked: ${s.found} found, ${s.notFound} not found, ${s.unified} unified${ran.value.segment ? `, ${s.members} in ${ran.value.segmentLabel}` : ''}.`, '', head, sep, ...body].join('\n')
}
function bulkSheets() {
  const yn = (v) => (v == null ? '' : v ? 'yes' : 'no')
  const columns = ['Input', 'Kind', 'Found', 'Source records', 'Unified profiles', ...(ran.value.segment ? ['In segment', 'Matches now'] : []), 'Note']
  return [{ name: 'Bulk lookup', columns, rows: shown.value.map((r) => [r.input, r.kind, yn(r.sourceIds.length > 0), r.sourceIds.join(' '), r.unifiedIds.join(' '), ...(ran.value.segment ? [yn(r.member), yn(r.matchesNow)] : []), r.note]) }]
}

const yn = (v) => (v == null ? '' : v ? 'yes' : 'no')
const card = 'dci-card'
const btn = 'dci-btn'
</script>

<template>
  <section class="max-w-6xl mx-auto space-y-4">
    <div>
      <PageHeader path="/bulk" title="Bulk lookup" topic="bulk" data-help="bulk">Paste emails, phones or IDs (one per line, or separated by commas), up to {{ MAX_INPUTS.toLocaleString() }}. Each is checked in Data Cloud, with its unified profile and, if you pick one, segment membership.</PageHeader>
    </div>

    <div :class="[card, 'p-3 space-y-2']">
      <textarea v-model="text" rows="7" spellcheck="false" placeholder="jane@example.com&#10;+1 415 555 0100&#10;003..." class="w-full border rounded-md p-2 bg-background font-mono text-xs" />
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <span class="text-muted-foreground">{{ items.length.toLocaleString() }} unique values{{ tooMany ? `, only the first ${MAX_INPUTS.toLocaleString()} are checked` : '' }}{{ items.length && valuesAs === 'auto' ? `: ${detected}` : '' }}</span>
        <label class="text-muted-foreground" for="bulk-as">Values are</label>
        <select id="bulk-as" v-model="valuesAs" class="border rounded-md px-2 py-1 bg-background">
          <option value="auto">detected automatically</option><option value="email">emails</option><option value="phone">phone numbers</option><option value="id">record IDs</option><option value="field">values of a field…</option>
        </select>
        <template v-if="valuesAs === 'field'">
          <select v-model="fieldObject" class="border rounded-md px-2 py-1 bg-background max-w-56" aria-label="Object to look in" @change="fieldName = ''"><option v-for="t in targets" :key="t.object" :value="t.object">{{ t.label }}</option></select>
          <select v-model="fieldName" class="border rounded-md px-2 py-1 bg-background max-w-56 font-mono text-xs" aria-label="Field to look in"><option value="">Field…</option><option v-for="f in target?.fields || []" :key="f.name" :value="f.name">{{ f.name }}</option></select>
        </template>
        <label class="ml-auto text-muted-foreground" for="bulk-rs">Ruleset</label>
        <select id="bulk-rs" v-model="rulesetId" class="border rounded-md px-2 py-1 bg-background"><option value="">none</option><option v-for="r in rulesets" :key="r.id" :value="r.id">{{ r.label }} ({{ r.id }})</option></select>
        <label class="text-muted-foreground" for="bulk-seg">Segment</label>
        <select id="bulk-seg" v-model="segmentName" class="border rounded-md px-2 py-1 bg-background"><option value="">none</option><option v-for="s in segments" :key="s.apiName" :value="s.apiName">{{ s.label }}</option></select>
        <button v-if="!items.length" class="text-link hover:underline disabled:opacity-50" :disabled="sampling || !org.version" @click="useSamples">{{ sampling ? 'Picking…' : 'Use 10 random examples' }}</button>
        <button class="dci-btn-primary" :disabled="!items.length || job?.status === 'running' || !org.version || (valuesAs === 'field' && !fieldName)" @click="run">{{ job?.status === 'running' ? 'Checking…' : 'Check' }}</button>
      </div>
      <p v-if="job?.status === 'running'" class="text-sm text-muted-foreground">Checking {{ job.progress || '' }}. You can use other pages meanwhile.</p>
      <p v-if="job?.status === 'failed'" class="text-sm text-destructive">{{ job.error }}</p>
    </div>

    <template v-if="rows.length">
      <div :class="[card, 'p-3 grid grid-cols-2 md:grid-cols-6 gap-3 text-sm']">
        <div><div class="text-muted-foreground">Checked</div><div class="text-lg">{{ summary.total.toLocaleString() }}</div></div>
        <div><div class="text-muted-foreground">Found</div><div class="text-lg">{{ summary.found.toLocaleString() }}</div></div>
        <div><div class="text-muted-foreground">Not found</div><div class="text-lg">{{ summary.notFound.toLocaleString() }}</div></div>
        <div><div class="text-muted-foreground">Unified</div><div class="text-lg">{{ summary.unified.toLocaleString() }}</div></div>
        <div><div class="text-muted-foreground">In several profiles</div><div class="text-lg">{{ summary.severalProfiles.toLocaleString() }}</div></div>
        <div v-if="ran.segment"><div class="text-muted-foreground">In {{ ran.segmentLabel }}</div><div class="text-lg">{{ summary.members.toLocaleString() }}</div></div>
      </div>
      <div class="flex flex-wrap items-center gap-1 text-xs">
        <button v-for="[id, label, test] in FILTERS.filter(([id]) => ran.segment || !['member', 'notMember'].includes(id))" :key="id"
          :class="['px-2 py-1 rounded-md border', show === id ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent']" @click="show = id">
          {{ label }} ({{ rows.filter(test).length }})
        </button>
        <span class="ml-auto flex gap-2">
          <button :class="btn" @click="download">Download CSV</button>
          <DownloadMenu :get-markdown="bulkMarkdown" :get-sheets="bulkSheets" file-name="bulk-lookup" />
        </span>
      </div>
      <p v-if="notice" class="text-xs text-muted-foreground">{{ notice }}</p>
      <DataTable :columns="bulkCols" :rows="shown" row-key="input" box-class="max-h-[60vh]">
        <template #cell-input="{ row: r }"><span class="font-mono text-xs">{{ r.input }}</span> <span class="text-xs text-muted-foreground">{{ r.kind }}</span></template>
        <template #cell-sources="{ row: r }">
          <div class="text-xs">
            <RouterLink v-for="s in upTo(r.sourceIds, `s:${r.input}`)" :key="s" :to="{ path: `/profile/s/${s}`, query: { rs: ran.rulesetId || undefined } }" class="block font-mono text-link hover:underline">{{ s }}</RouterLink>
            <button v-if="r.sourceIds.length > 3" class="text-link hover:underline" @click="toggleMore(`s:${r.input}`)">{{ expanded.has(`s:${r.input}`) ? 'Show fewer' : `and ${r.sourceIds.length - 3} more` }}</button>
          </div>
        </template>
        <template #cell-unified="{ row: r }">
          <div class="text-xs">
            <RouterLink v-for="u in upTo(r.unifiedIds, `u:${r.input}`)" :key="u" :to="{ path: `/profile/u/${u}`, query: { rs: ran.rulesetId } }" class="block font-mono text-link hover:underline">{{ u }}</RouterLink>
            <button v-if="r.unifiedIds.length > 3" class="text-link hover:underline" @click="toggleMore(`u:${r.input}`)">{{ expanded.has(`u:${r.input}`) ? 'Show fewer' : `and ${r.unifiedIds.length - 3} more` }}</button>
          </div>
        </template>
        <template #cell-note="{ value }"><span class="text-xs text-muted-foreground">{{ value }}</span></template>
      </DataTable>
    </template>
  </section>
</template>
