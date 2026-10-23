<script setup>
import DownloadMenu from '../components/DownloadMenu.vue'
import HelpTip from '../components/HelpTip.vue'
import { ref, shallowRef, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Search, Copy, ChevronRight, ChevronDown } from 'lucide-vue-next'
import RelatedTable from '../components/RelatedTable.vue'
import RecordLink from '../components/RecordLink.vue'
import { recordUrl, recordKind } from '../lib/links.js'
import { currentOrg } from '../app/useOrg.js'
import { useOrg } from '../app/useOrg.js'
import { useCatalog, ensureCatalog, orgCall, cachedRulesets } from '../app/useCatalog.js'
import { runQuery } from '../lib/query.js'
import { samplesSql, samplesFrom } from '../lib/samples.js'
import { inSpace } from '../lib/dataSpace.js'
import {
  INDIVIDUAL, parseRulesets, search, loadProfile, loadRelated, explainMatches, possibleMissedMatches,
  displayName, eventTimeField, profileMarkdown, FUZZY_THRESHOLD,
} from '../lib/profile.js'

const route = useRoute()
const router = useRouter()
const org = useOrg()
const catalog = useCatalog()

const text = ref(String(route.query.q || ''))
const rulesets = ref([])
const rulesetId = ref('')
const rsError = ref('')
const results = ref(null) // { kind, groups }
const searching = ref(false)
const error = ref('')
const notice = ref('')

const profile = shallowRef(null) // { unifiedId, unified, links, sources }
const related = shallowRef([]) // source side
const unifiedRelated = shallowRef([])
const missed = ref([])
const loading = ref('')
const open = ref({}) // expanded source rows / events

const ruleset = computed(() => rulesets.value.find((r) => r.id === rulesetId.value) || null)
const byName = computed(() => new Map(catalog.objects.map((o) => [o.name, o])))
const q = async (sql) => runQuery(orgCall(), org.version, sql, { rowLimit: 2000 })
const rsKey = () => `dci_ruleset_${org.orgId}`

async function loadRulesets() {
  rsError.value = ''
  if (!org.orgId || !org.version) return
  try {
    rulesets.value = await cachedRulesets(async () => {
      const res = await orgCall()(`/services/data/v${org.version}/ssot/identity-resolutions`)
      if (!res.ok) throw new Error(res.error || `HTTP ${res.status}`)
      return parseRulesets(inSpace(res.data?.identityResolutions, org.dataSpace))
    })
  } catch (err) { rsError.value = err.message; return }
  let saved = null
  try { saved = localStorage.getItem(rsKey()) } catch { /* private window */ }
  rulesetId.value = String(route.query.rs || '') || (rulesets.value.some((r) => r.id === saved) ? saved : rulesets.value[0]?.id || '')
}

onMounted(async () => {
  ensureCatalog()
  await loadRulesets()
  fromRoute()
})
watch(() => [org.orgId, org.version, org.dataSpace], async () => { await loadRulesets(); fromRoute() })
watch(rulesetId, (id) => { try { localStorage.setItem(rsKey(), id) } catch { /* ignore */ } })
watch(() => route.fullPath, fromRoute)

// /profile?q=...&rs=...            search
// /profile/u/<unified id>?rs=...   a unified profile
// /profile/s/<source id>?rs=...    a source Individual (and its unified profile if any)
function fromRoute() {
  if (!org.version || !rulesets.value) return
  if (route.query.rs && route.query.rs !== rulesetId.value) rulesetId.value = String(route.query.rs)
  if (route.params.kind && route.params.id) openProfile(route.params.kind, String(route.params.id))
  else if (route.query.q) { text.value = String(route.query.q); runSearch() }
  else { profile.value = null; results.value = null }
}

function go(path, query = {}) {
  router.push({ path, query: { ...query, rs: rulesetId.value || undefined } })
}

// An empty search shows 10 random people to try (feedback #105).
const samples = ref(null) // null, 'loading', [] or [{ name, email, phone, id, value }]
async function showSamples() {
  if (!org.version) return
  results.value = null
  error.value = ''
  samples.value = 'loading'
  try {
    await ensureCatalog()
    const sql = samplesSql(catalog.objects.map((o) => o.name))
    samples.value = sql ? samplesFrom(await runQuery(orgCall(), org.version, sql, { rowLimit: 10 })) : []
  } catch (err) {
    samples.value = null
    error.value = err.message
  }
}
function trySample(sm) { samples.value = null; text.value = sm.value; go('/profile', { q: sm.value }) }

async function runSearch() {
  if (!text.value.trim() || !org.version) return
  searching.value = true
  error.value = ''
  profile.value = null
  try {
    results.value = await search(q, text.value, ruleset.value)
    if (results.value.groups.length === 1) {
      const g = results.value.groups[0]
      router.replace({ path: g.unifiedId ? `/profile/u/${g.unifiedId}` : `/profile/s/${g.sources[0].id}`, query: { rs: rulesetId.value || undefined } })
    }
  } catch (err) {
    error.value = err.message
  } finally {
    searching.value = false
  }
}

// A unified ID belongs to one ruleset, so a profile is re-opened through its first source
// record, which every ruleset shares.
function switchRuleset() {
  const first = profile.value?.sources[0]?.ssot__Id__c
  if (first) go(`/profile/s/${first}`)
  else if (route.query.q) go('/profile', { q: route.query.q })
}

let loadSeq = 0
async function openProfile(kind, id) {
  const seq = ++loadSeq
  error.value = ''
  notice.value = ''
  results.value = null
  open.value = {}
  related.value = []
  unifiedRelated.value = []
  missed.value = []
  loading.value = 'Loading the profile…'
  await ensureCatalog()
  try {
    const p = await loadProfile(q, kind === 'u' ? { unifiedId: id, ruleset: ruleset.value } : { sourceId: id, ruleset: ruleset.value })
    if (seq !== loadSeq) return
    profile.value = p
    if (kind === 'u' && !p.unified && !p.links.length) {
      profile.value = null
      error.value = `${id} is not a unified profile of the ${ruleset.value?.label || 'selected'} ruleset.`
      loading.value = ''
      return
    }
    if (!p.sources.length && !p.unified) { error.value = 'Nothing found for that ID.'; loading.value = ''; return }
    loading.value = 'Loading related records…'
    const skip = (r) => r.object.startsWith('UnifiedLink')
    const [src, uni] = await Promise.all([
      loadRelated(q, INDIVIDUAL, p.sources, catalog.objects, { skip }),
      p.unified && ruleset.value ? loadRelated(q, ruleset.value.unified, [p.unified], catalog.objects, { skip }) : [],
    ])
    if (seq !== loadSeq) return
    related.value = src
    unifiedRelated.value = uni
    missed.value = await possibleMissedMatches(q, p.sources.map((s) => s.ssot__Id__c), src).catch(() => [])
  } catch (err) {
    if (seq === loadSeq) error.value = err.message
  } finally {
    if (seq === loadSeq) loading.value = ''
  }
}

const explanation = computed(() => (profile.value && ruleset.value ? explainMatches(ruleset.value, profile.value.sources, related.value) : []))
const title = computed(() => {
  const p = profile.value
  if (!p) return ''
  return p.unified ? displayName(p.unified) : p.sources[0] ? displayName(p.sources[0]) : ''
})
const filled = (row) => Object.entries(row || {}).filter(([, v]) => v != null && v !== '')
const sourceName = (id) => displayName(profile.value?.sources.find((s) => s.ssot__Id__c === id) || {})
const linkFor = (id) => profile.value?.links.find((l) => l.SourceRecordId__c === id)

const withRows = (list) => list.filter((r) => r.rows.length || r.error)
const contactPoints = computed(() => withRows([...unifiedRelated.value, ...related.value].filter((r) => /ContactPoint/i.test(r.object))))
const segments = computed(() => withRows([...related.value, ...unifiedRelated.value].filter((r) => r.category === 'Segment_Membership')))
const others = computed(() => withRows([...related.value, ...unifiedRelated.value].filter((r) => !/ContactPoint/i.test(r.object) && r.category !== 'Segment_Membership' && r.category !== 'Engagement')))
const emptyCount = computed(() => [...related.value, ...unifiedRelated.value].filter((r) => !r.rows.length && !r.error).length)

// Engagement from every engagement DMO, newest first.
const events = computed(() => {
  const out = []
  for (const r of related.value.filter((x) => x.category === 'Engagement')) {
    const timeField = eventTimeField(byName.value.get(r.object))
    for (const row of r.rows) out.push({ object: r.object, label: byName.value.get(r.object)?.label || r.object, time: timeField ? row[timeField] : null, row })
  }
  return out.sort((a, b) => String(b.time ?? '').localeCompare(String(a.time ?? '')))
})
const engagementErrors = computed(() => related.value.filter((r) => r.category === 'Engagement' && r.error))
const eventSummary = (row) => Object.entries(row)
  .filter(([k, v]) => v != null && v !== '' && !/Id__c$|^KQ_|DataSource|InternalOrganization|Created|Modified/i.test(k))
  .slice(0, 4).map(([k, v]) => `${k.replace(/^ssot__|__c$/g, '')}: ${v}`).join(' · ')

function toSql(sql) {
  router.push({ path: '/sql', query: { sql } })
}

const profileMd = () => profileMarkdown({ ruleset: ruleset.value, profile: profile.value, related: [...related.value, ...unifiedRelated.value], explanation: explanation.value })

const when = (iso) => (iso ? new Date(iso).toLocaleString() : '')
const card = 'border rounded-md bg-card'
const btn = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-sm hover:bg-accent disabled:opacity-50'
</script>

<template>
  <section class="space-y-4 max-w-7xl mx-auto">
    <form class="flex flex-wrap gap-2 items-center" @submit.prevent="text.trim() ? (samples = null, go('/profile', { q: text })) : showSamples()">
      <input v-model="text" placeholder="Email, phone, name or ID (use * as a wildcard)" class="flex-1 min-w-72 border rounded-md px-3 py-1.5 bg-background text-sm" />
      <label class="text-sm text-muted-foreground" for="rs">Ruleset</label>
      <select id="rs" v-model="rulesetId" class="border rounded-md px-2 py-1.5 bg-background text-sm" @change="switchRuleset">
        <option v-if="!rulesets.length" value="">No identity resolution rulesets</option>
        <option v-for="r in rulesets" :key="r.id" :value="r.id">{{ r.label }} ({{ r.id }}), last run {{ r.lastJobStatus.toLowerCase() || 'unknown' }}</option>
      </select>
      <button class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50" :disabled="searching || !org.version">
        {{ searching ? 'Searching…' : 'Search' }}
      </button>
      <RouterLink to="/bulk" class="text-sm text-link hover:underline">Bulk lookup</RouterLink>
    </form>
    <div v-if="samples" class="border rounded-md bg-card p-3 text-sm space-y-2">
      <p class="text-muted-foreground">{{ samples === 'loading' ? 'Picking 10 random people…' : samples.length ? 'Nothing to search for, so here are 10 random people to try:' : 'No people found to suggest.' }}</p>
      <div v-if="Array.isArray(samples)" class="flex flex-wrap gap-1.5">
        <button v-for="sm in samples" :key="sm.id + sm.value" class="px-2 py-1 rounded-md border hover:bg-accent text-left" :title="[sm.email, sm.phone, sm.id].filter(Boolean).join(' · ')" @click="trySample(sm)">
          <span>{{ sm.name || sm.id }}</span> <span class="font-mono text-xs text-muted-foreground">{{ sm.value }}</span>
        </button>
      </div>
      <button v-if="Array.isArray(samples) && samples.length" class="text-xs text-link hover:underline" @click="showSamples">Another 10</button>
    </div>
    <div v-if="rsError" class="text-sm text-destructive">Could not read the rulesets: {{ rsError }}</div>
    <div v-if="error" class="p-3 rounded-md border border-destructive text-sm whitespace-pre-wrap">{{ error }}</div>

    <!-- Search results -->
    <div v-if="results && !profile" class="space-y-2">
      <p class="text-sm text-muted-foreground">
        {{ results.groups.length ? `${results.groups.length} ${results.groups.length === 1 ? 'person' : 'people'} found by ${results.kind}` : `Nobody found by ${results.kind}.` }}
        <span v-if="ruleset">Grouped by the {{ ruleset.label }} ruleset.</span>
      </p>
      <button
        v-for="g in results.groups" :key="g.unifiedId || g.sources[0].id"
        :class="[card, 'w-full text-left p-3 hover:bg-accent flex items-center gap-3']"
        @click="g.unifiedId ? go(`/profile/u/${g.unifiedId}`) : go(`/profile/s/${g.sources[0].id}`)"
      >
        <div class="flex-1 min-w-0">
          <div class="font-medium">{{ g.sources.map((s) => s.name).filter((n, i, a) => a.indexOf(n) === i).join(', ') }}</div>
          <div class="text-xs text-muted-foreground font-mono">
            {{ g.unifiedId ? `unified ${g.unifiedId} · ${g.sources.length} source record${g.sources.length === 1 ? '' : 's'}` : `not unified · source ${g.sources[0].id}` }}
          </div>
        </div>
        <ChevronRight class="w-4 h-4 text-muted-foreground" />
      </button>
    </div>

    <p v-if="!results && !profile && !loading && !error" class="text-sm text-muted-foreground">
      Look up a person to see their unified profile, the source records behind it, why identity resolution joined them, contact points, engagement and segment membership.
    </p>
    <p v-if="loading" class="text-sm text-muted-foreground">{{ loading }}</p>

    <!-- Profile -->
    <template v-if="profile">
      <div class="flex flex-wrap items-start gap-3">
        <div>
          <h2 class="text-xl font-semibold">{{ title }}</h2>
          <div class="text-sm text-muted-foreground">
            <template v-if="profile.unifiedId">Unified profile <span class="font-mono">{{ profile.unifiedId }}</span> from {{ profile.sources.length }} source record{{ profile.sources.length === 1 ? '' : 's' }} ({{ ruleset?.label }})</template>
            <template v-else>Source record <span class="font-mono">{{ profile.sources[0]?.ssot__Id__c }}</span>, <strong>not unified</strong> by {{ ruleset ? ruleset.label : 'any ruleset' }}<span v-if="ruleset"> (last run {{ ruleset.lastJobStatus.toLowerCase() }} {{ when(ruleset.lastJobCompleted) }})</span></template>
          </div>
        </div>
        <div class="ml-auto flex gap-2">
          <a v-if="ruleset?.recordId" :class="btn" :href="recordUrl(currentOrg()?.host, ruleset.recordId)" target="_blank" rel="noopener">Open ruleset</a>
          <DownloadMenu :get-markdown="profileMd" :file-name="`profile-${title || 'person'}`" :disabled="!!loading" />
        </div>
      </div>
      <div v-if="notice" class="text-sm text-muted-foreground">{{ notice }}</div>

      <div class="grid lg:grid-cols-2 gap-4">
        <!-- Unified record -->
        <div v-if="profile.unified" :class="card">
          <h3 class="p-3 border-b font-medium">Unified record</h3>
          <dl class="p-3 grid grid-cols-[minmax(10rem,auto)_1fr] gap-x-3 gap-y-1 text-sm">
            <template v-for="[k, v] in filled(profile.unified)" :key="k">
              <dt class="font-mono text-xs text-muted-foreground">{{ k }}</dt><dd class="break-all"><RecordLink :value="v" /></dd>
            </template>
          </dl>
        </div>

        <!-- Source records -->
        <div :class="[card, profile.unified ? '' : 'lg:col-span-2']">
          <h3 class="p-3 border-b font-medium">Source records ({{ profile.sources.length }})</h3>
          <div v-for="s in profile.sources" :key="s.ssot__Id__c" class="border-b last:border-0">
            <button class="w-full text-left p-3 flex items-start gap-2 hover:bg-accent" @click="open[s.ssot__Id__c] = !open[s.ssot__Id__c]">
              <component :is="open[s.ssot__Id__c] ? ChevronDown : ChevronRight" class="w-4 h-4 mt-0.5 shrink-0" />
              <div class="min-w-0">
                <div class="font-medium flex items-center gap-2">
                  {{ displayName(s) }}
                  <a v-if="recordKind(s.ssot__Id__c)" :href="recordUrl(currentOrg()?.host, s.ssot__Id__c)" target="_blank" rel="noopener" class="text-xs text-link hover:underline inline-flex items-center gap-1" @click.stop>
                    {{ recordKind(s.ssot__Id__c) }}
                  </a>
                </div>
                <div class="text-xs text-muted-foreground font-mono break-all">
                  {{ s.ssot__Id__c }} · {{ s.ssot__DataSourceId__c }} / {{ s.ssot__DataSourceObjectId__c }}
                </div>
                <div v-if="linkFor(s.ssot__Id__c)?.MatchKeys__c" class="text-xs mt-1">
                  Match keys: <span class="font-mono">{{ linkFor(s.ssot__Id__c).MatchKeys__c }}</span>
                </div>
              </div>
            </button>
            <dl v-if="open[s.ssot__Id__c]" class="px-9 pb-3 grid grid-cols-[minmax(10rem,auto)_1fr] gap-x-3 gap-y-1 text-sm">
              <template v-for="[k, v] in filled(s)" :key="k">
                <dt class="font-mono text-xs text-muted-foreground">{{ k }}</dt><dd class="break-all"><RecordLink :value="v" /></dd>
              </template>
              <template v-for="[k, v] in filled(linkFor(s.ssot__Id__c))" :key="`link-${k}`">
                <dt class="font-mono text-xs text-muted-foreground">link: {{ k }}</dt><dd class="break-all"><RecordLink :value="v" /></dd>
              </template>
            </dl>
          </div>
        </div>
      </div>

      <!-- Why these records are together -->
      <div v-if="ruleset" :class="card">
        <h3 class="p-3 border-b font-medium" data-help="profile-rules">Match rules of {{ ruleset.label }} <HelpTip topic="profile-rules" /></h3>
        <div class="p-3 space-y-4 text-sm">
          <p v-if="profile.sources.length < 2" class="text-muted-foreground">
            One source record, so there is nothing to match. These are the values the rules compare; see Possible missed matches below for others that share an email.
          </p>
          <div v-for="(e, i) in explanation" :key="i" class="space-y-2">
            <div class="font-medium">{{ e.rule.label || `Rule ${i + 1}` }}</div>
            <div class="overflow-auto">
              <table class="text-xs border-collapse">
                <thead>
                  <tr class="text-muted-foreground">
                    <th class="px-2 py-1 text-left font-normal">Criterion</th>
                    <th v-for="s in profile.sources" :key="s.ssot__Id__c" class="px-2 py-1 text-left font-normal">{{ displayName(s) }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in e.table" :key="row.criterion.entity + row.criterion.field" class="border-t">
                    <td class="px-2 py-1 whitespace-nowrap">
                      <span class="font-mono">{{ row.criterion.entity.replace(/^ssot__|__dlm$/g, '') }}.{{ row.criterion.field.replace(/^ssot__|__c$/g, '') }}</span>
                      <span class="text-muted-foreground ml-1.5">{{ row.criterion.method }}</span>
                    </td>
                    <td v-for="s in profile.sources" :key="s.ssot__Id__c" class="px-2 py-1 font-mono">
                      {{ row.values[s.ssot__Id__c]?.join(', ') || '' }}<span v-if="!row.values[s.ssot__Id__c]?.length" class="text-muted-foreground italic">blank</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-if="profile.sources.length > 1" class="text-xs">
              <template v-if="e.pairs.length">Satisfied by: {{ e.pairs.map(([a, b]) => `${sourceName(a)} + ${sourceName(b)}`).join('; ') }}</template>
              <template v-else>No pair of these records satisfies every criterion by our check; they may have been joined through another record or rule (identity resolution is transitive).</template>
            </p>
          </div>
          <p class="text-xs text-muted-foreground">
            Exact and normalized checks follow the rule settings. Fuzzy is approximated (Jaro-Winkler at {{ FUZZY_THRESHOLD }}); Salesforce does not publish its fuzzy algorithm. The link record's match keys, when present, are what Salesforce recorded.
          </p>
        </div>
      </div>

      <!-- Possible missed matches -->
      <div v-if="missed.length" :class="card">
        <h3 class="p-3 border-b font-medium flex items-center gap-2" data-help="profile-missed">Possible missed matches ({{ missed.length }}) <HelpTip topic="profile-missed" /></h3>
        <p class="px-3 pt-3 text-xs text-muted-foreground">Other people with the same email who are not in this profile. That is expected when the other criteria differ (for example the names); check the match rules above.</p>
        <ul class="p-3 text-sm space-y-1">
          <li v-for="m in missed" :key="m.id">
            <button class="text-link hover:underline" @click="go(`/profile/s/${m.id}`)">{{ m.name }}</button>
            <span class="text-muted-foreground ml-1.5">also has {{ m.shared }}</span>
          </li>
        </ul>
      </div>

      <!-- Contact points -->
      <div v-if="contactPoints.length" :class="card">
        <h3 class="p-3 border-b font-medium">Contact points</h3>
        <div v-for="r in contactPoints" :key="r.object + r.otherField" class="border-b last:border-0 p-3 space-y-1">
          <div class="text-sm flex items-center gap-2">
            <RouterLink :to="`/objects/${r.object}`" class="font-mono text-link hover:underline">{{ r.object }}</RouterLink>
            <span class="text-muted-foreground">{{ r.rows.length }}{{ r.more ? '+' : '' }} rows</span>
            <button v-if="r.sql" class="ml-auto text-xs inline-flex items-center gap-1 hover:underline" @click="toSql(r.sql)">SQL</button>
          </div>
          <p v-if="r.error" class="text-xs text-destructive">{{ r.error }}</p>
          <RelatedTable :rows="r.rows" />
        </div>
      </div>

      <!-- Engagement -->
      <div :class="card">
        <h3 class="p-3 border-b font-medium">Engagement ({{ events.length }})</h3>
        <p v-if="!events.length && !loading" class="p-3 text-sm text-muted-foreground">No engagement rows for these source records.</p>
        <ul class="text-sm">
          <li v-for="(ev, i) in events.slice(0, 200)" :key="i" class="border-b last:border-0">
            <button class="w-full text-left px-3 py-1.5 flex gap-3 hover:bg-accent" @click="open[`ev${i}`] = !open[`ev${i}`]">
              <span class="font-mono text-xs w-44 shrink-0 text-muted-foreground">{{ ev.time ? when(ev.time) : 'no time' }}</span>
              <span class="w-48 shrink-0 truncate">{{ ev.label }}</span>
              <span class="truncate text-muted-foreground">{{ eventSummary(ev.row) }}</span>
            </button>
            <dl v-if="open[`ev${i}`]" class="px-3 pb-2 grid grid-cols-[minmax(10rem,auto)_1fr] gap-x-3 text-xs">
              <template v-for="[k, v] in filled(ev.row)" :key="k"><dt class="font-mono text-muted-foreground">{{ k }}</dt><dd class="break-all"><RecordLink :value="v" /></dd></template>
            </dl>
          </li>
        </ul>
        <p v-for="r in engagementErrors" :key="r.object" class="px-3 pb-2 text-xs text-destructive">{{ r.object }}: {{ r.error }}</p>
      </div>

      <!-- Segment membership and the rest -->
      <div v-for="group in [{ title: 'Segment membership', list: segments }, { title: 'Other related records', list: others }]" :key="group.title">
        <div v-if="group.list.length" :class="card">
          <h3 class="p-3 border-b font-medium">{{ group.title }}</h3>
          <div v-for="r in group.list" :key="r.object + r.otherField" class="border-b last:border-0 p-3 space-y-1">
            <div class="text-sm flex items-center gap-2">
              <RouterLink :to="`/objects/${r.object}`" class="text-link hover:underline">{{ byName.get(r.object)?.label || r.object }}</RouterLink>
              <span class="font-mono text-xs text-muted-foreground">{{ r.object }} by {{ r.otherField }}</span>
              <span class="text-muted-foreground text-xs">{{ r.rows.length }}{{ r.more ? '+' : '' }} rows</span>
              <button v-if="r.sql" class="ml-auto text-xs inline-flex items-center gap-1 hover:underline" @click="toSql(r.sql)">SQL</button>
            </div>
            <p v-if="r.error" class="text-xs text-destructive">{{ r.error }}</p>
            <RelatedTable :rows="r.rows" />
          </div>
        </div>
      </div>
      <p v-if="!loading && emptyCount" class="text-xs text-muted-foreground">{{ emptyCount }} other related objects have no rows for this person.</p>
    </template>
  </section>
</template>
