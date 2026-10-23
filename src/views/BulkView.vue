<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useOrg } from '../app/useOrg.js'
import { useCatalog, ensureCatalog, orgCall, cachedRulesets } from '../app/useCatalog.js'
import { useJob, startJob, markSeen } from '../app/useJobs.js'
import { runQuery } from '../lib/query.js'
import { inSpace } from '../lib/dataSpace.js'
import { parseRulesets } from '../lib/profile.js'
import { loadSegments, membershipTables } from '../lib/segments.js'
import { parseInputs, bulkLookup, bulkSummary, bulkCsv, MAX_INPUTS } from '../lib/bulkLookup.js'

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

const items = computed(() => parseInputs(text.value))
const tooMany = computed(() => items.value.length > MAX_INPUTS)

async function run() {
  await ensureCatalog()
  const ruleset = rulesets.value.find((r) => r.id === rulesetId.value) || null
  const segment = segments.value.find((s) => s.apiName === segmentName.value) || null
  const latestTable = segment ? membershipTables(segment, catalog.objects).latest : null
  const list = items.value.slice(0, MAX_INPUTS)
  const objects = catalog.objects
  startJob(jobId.value, (progress) => bulkLookup(q, list, { ruleset, segment, catalog: objects, latestTable, progress }), {
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
const shown = computed(() => rows.value.filter(FILTERS.find((f) => f[0] === show.value)[2]))

function download() {
  const url = URL.createObjectURL(new Blob([bulkCsv(rows.value, { segment: ran.value.segment })], { type: 'text/csv' }))
  Object.assign(document.createElement('a'), { href: url, download: `bulk-lookup-${new Date().toISOString().slice(0, 10)}.csv` }).click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
async function copyMarkdown() {
  const yn = (v) => (v == null ? '' : v ? 'yes' : 'no')
  const head = `| Input | Found | Unified profiles |${ran.value.segment ? ' In segment | Matches now |' : ''} Note |`
  const sep = `| --- | --- | --- |${ran.value.segment ? ' --- | --- |' : ''} --- |`
  const body = shown.value.map((r) => `| ${r.input} | ${r.sourceIds.length} | ${r.unifiedIds.length} |${ran.value.segment ? ` ${yn(r.member)} | ${yn(r.matchesNow)} |` : ''} ${r.note} |`)
  await navigator.clipboard.writeText([head, sep, ...body].join('\n'))
  notice.value = `Copied ${shown.value.length} rows as Markdown.`
}

const yn = (v) => (v == null ? '' : v ? 'yes' : 'no')
const card = 'border rounded-md bg-card'
const btn = 'inline-flex items-center px-2.5 py-1.5 rounded-md border text-sm hover:bg-accent disabled:opacity-50'
</script>

<template>
  <section class="max-w-6xl mx-auto space-y-4">
    <div>
      <h2 class="text-lg font-semibold">Bulk lookup</h2>
      <p class="text-sm text-muted-foreground">Paste emails, phones or IDs (one per line, or separated by commas), up to {{ MAX_INPUTS.toLocaleString() }}. Each is checked in Data Cloud, with its unified profile and, if you pick one, segment membership.</p>
    </div>

    <div :class="[card, 'p-3 space-y-2']">
      <textarea v-model="text" rows="7" spellcheck="false" placeholder="jane@example.com&#10;+1 415 555 0100&#10;003..." class="w-full border rounded-md p-2 bg-background font-mono text-xs" />
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <span class="text-muted-foreground">{{ items.length.toLocaleString() }} unique values{{ tooMany ? `, only the first ${MAX_INPUTS.toLocaleString()} are checked` : '' }}</span>
        <label class="ml-auto text-muted-foreground" for="bulk-rs">Ruleset</label>
        <select id="bulk-rs" v-model="rulesetId" class="border rounded-md px-2 py-1 bg-background"><option value="">none</option><option v-for="r in rulesets" :key="r.id" :value="r.id">{{ r.label }} ({{ r.id }})</option></select>
        <label class="text-muted-foreground" for="bulk-seg">Segment</label>
        <select id="bulk-seg" v-model="segmentName" class="border rounded-md px-2 py-1 bg-background"><option value="">none</option><option v-for="s in segments" :key="s.apiName" :value="s.apiName">{{ s.label }}</option></select>
        <button class="px-3 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50" :disabled="!items.length || job?.status === 'running' || !org.version" @click="run">{{ job?.status === 'running' ? 'Checking…' : 'Check' }}</button>
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
          <button :class="btn" @click="copyMarkdown">Copy as Markdown</button>
        </span>
      </div>
      <p v-if="notice" class="text-xs text-muted-foreground">{{ notice }}</p>
      <div :class="[card, 'overflow-auto max-h-[60vh]']">
        <table class="w-full text-sm">
          <thead class="text-left text-muted-foreground border-b sticky top-0 bg-card">
            <tr><th class="p-2 font-normal">Input</th><th class="p-2 font-normal">Source records</th><th class="p-2 font-normal">Unified profile</th><th v-if="ran.segment" class="p-2 font-normal">In segment</th><th v-if="ran.segment" class="p-2 font-normal">Matches now</th><th class="p-2 font-normal">Note</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in shown" :key="r.input" class="border-b last:border-0 align-top">
              <td class="p-2 font-mono text-xs">{{ r.input }} <span class="text-muted-foreground">{{ r.kind }}</span></td>
              <td class="p-2 text-xs">
                <RouterLink v-for="s in r.sourceIds.slice(0, 3)" :key="s" :to="{ path: `/profile/s/${s}`, query: { rs: ran.rulesetId || undefined } }" class="block font-mono text-link hover:underline">{{ s }}</RouterLink>
                <span v-if="r.sourceIds.length > 3" class="text-muted-foreground">and {{ r.sourceIds.length - 3 }} more</span>
              </td>
              <td class="p-2 text-xs">
                <RouterLink v-for="u in r.unifiedIds.slice(0, 3)" :key="u" :to="{ path: `/profile/u/${u}`, query: { rs: ran.rulesetId } }" class="block font-mono text-link hover:underline">{{ u }}</RouterLink>
                <span v-if="r.unifiedIds.length > 3" class="text-muted-foreground">and {{ r.unifiedIds.length - 3 }} more</span>
              </td>
              <td v-if="ran.segment" class="p-2">{{ yn(r.member) }}</td>
              <td v-if="ran.segment" class="p-2">{{ yn(r.matchesNow) }}</td>
              <td class="p-2 text-xs text-muted-foreground">{{ r.note }}{{ r.unifiedIds.length > 1 ? `${r.note ? '; ' : ''}in ${r.unifiedIds.length} profiles` : '' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>
