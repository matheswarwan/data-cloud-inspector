<script setup>
import DownloadMenu from '../components/DownloadMenu.vue'
import HelpTip from '../components/HelpTip.vue'
import { ref, shallowRef, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ChevronDown, ChevronLeft, ChevronRight, Code, Copy, List, Search, ShieldCheck, Workflow, X } from 'lucide-vue-next'
import { mcnListed } from '../lib/optionalPages.js'
import PeopleTabs from '../components/PeopleTabs.vue'
import PageHeader from '../components/PageHeader.vue'
import { profileMemory, rememberProfile, forgetAll, groupPath, groupIndex } from '../lib/profileMemory.js'
import RelatedTable from '../components/RelatedTable.vue'
import { channelOf, actionOf, engagementSummary, loadConsent, consentFacts } from '../lib/marketing.js'
import { addressesFrom, loadCrmConsent } from '../lib/crmConsent.js'
import { isOn } from '../lib/features.js'
// Consent and message history by channel (Marketing Cloud Next): only when Marketing flows or
// Campaigns is turned on in Settings > Pages.
const MCN = isOn('mcnProfile') && mcnListed()
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
const consent = shallowRef([]) // consent rows through the contact points (Marketing Cloud Next)
const consentLoading = ref(false)
const crmConsent = shallowRef(null) // { rows, errors, addresses } from Salesforce records
const missed = ref([])
const loading = ref('')
const open = ref({}) // expanded source rows / events
// The last search and the profiles opened from it, kept while the app is open (feedback #1037).
const mem = () => profileMemory(`${org.orgId}|${org.dataSpace}`)
const kept = shallowRef(null) // { text, rs, results } of the last search

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
// Remember where you were, so the Profiles link brings you back there.
watch(() => route.fullPath, () => { if (route.path.startsWith('/profile') && (route.params.id || route.query.q)) mem().lastPath = route.fullPath }, { immediate: true })

// /profile?q=...&rs=...            search
// /profile/u/<unified id>?rs=...   a unified profile
// /profile/s/<source id>?rs=...    a source Individual (and its unified profile if any)
function fromRoute() {
  if (!org.version || !rulesets.value) return
  kept.value = mem().search
  if (route.query.rs && route.query.rs !== rulesetId.value) rulesetId.value = String(route.query.rs)
  if (route.params.kind && route.params.id) openProfile(route.params.kind, String(route.params.id))
  else if (route.query.q) { text.value = String(route.query.q); runSearch() }
  else if (mem().lastPath) router.replace(mem().lastPath)
  else { profile.value = null; results.value = null }
}

// Start over: forget the kept search and profiles.
function clearSearch() {
  forgetAll(mem())
  kept.value = null
  text.value = ''
  samples.value = null
  profile.value = null
  results.value = null
  router.push('/profile')
}

// The search box: a new search runs again even for the same words.
function submitSearch() {
  if (!text.value.trim()) return showSamples()
  samples.value = null
  mem().search = null
  if (route.path === '/profile' && route.query.q === text.value) runSearch()
  else go('/profile', { q: text.value })
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

let searchSeq = 0
async function runSearch() {
  if (!text.value.trim() || !org.version) return
  error.value = ''
  profile.value = null
  const m = mem()
  if (m.search && m.search.text === text.value && m.search.rs === rulesetId.value) {
    results.value = m.search.results
    kept.value = m.search
    return
  }
  searching.value = true
  try {
    const seq = ++searchSeq
    const found = await search(q, text.value, ruleset.value)
    if (seq !== searchSeq) return
    results.value = found
    m.search = { text: text.value, rs: rulesetId.value, results: found }
    kept.value = m.search
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
  const memPath = `${route.path}|${rulesetId.value}`
  const had = mem().profiles.get(memPath)
  if (had) {
    Object.assign(state, had)
    loading.value = ''
    consentLoading.value = false
    return
  }
  related.value = []
  unifiedRelated.value = []
  consent.value = []
  crmConsent.value = null
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
    if (!MCN) { if (seq === loadSeq) keep(); return }
    consentLoading.value = true
    const cps = [...src, ...uni].filter((r) => /ContactPoint/i.test(r.object))
    const addresses = addressesFrom(cps)
    const [c, crm] = await Promise.all([
      loadConsent(q, cps, catalog.objects).catch(() => []),
      addresses.emails.length || addresses.phones.length ? loadCrmConsent(orgCall(), org.version, addresses).catch((e) => ({ rows: [], errors: [e.message] })) : null,
    ])
    if (seq === loadSeq) { consent.value = c; crmConsent.value = crm && { ...crm, addresses }; consentLoading.value = false }
    if (seq === loadSeq) keep()
  } catch (err) {
    if (seq === loadSeq) error.value = err.message
  } finally {
    if (seq === loadSeq) loading.value = ''
  }
  function keep() {
    rememberProfile(mem(), memPath, { profile: profile.value, related: related.value, unifiedRelated: unifiedRelated.value, consent: consent.value, crmConsent: crmConsent.value, missed: missed.value })
  }
}

// Writes a kept profile back into the page's refs.
const state = {
  set profile(v) { profile.value = v },
  set related(v) { related.value = v },
  set unifiedRelated(v) { unifiedRelated.value = v },
  set consent(v) { consent.value = v },
  set crmConsent(v) { crmConsent.value = v },
  set missed(v) { missed.value = v },
}

// Where the open profile sits in the kept results, to step through them.
const keptGroups = computed(() => kept.value?.results?.groups || [])
const keptIndex = computed(() => (profile.value && route.params.id ? groupIndex(keptGroups.value, route.params.kind, String(route.params.id), profile.value.unifiedId) : -1))
const groupName = (g) => g.sources.map((s) => s.name).filter((n, i, a) => n && a.indexOf(n) === i).join(', ') || g.unifiedId || g.sources[0].id
function goGroup(i) { const g = keptGroups.value[i]; if (g) go(groupPath(g)) }

const explanation = computed(() => (profile.value && ruleset.value ? explainMatches(ruleset.value, profile.value.sources, related.value) : []))
const title = computed(() => {
  const p = profile.value
  if (!p) return ''
  return p.unified ? displayName(p.unified) : p.sources[0] ? displayName(p.sources[0]) : ''
})
const filled = (row) => Object.entries(row || {}).filter(([, v]) => v != null && v !== '')
// Up to two initials for the avatar.
const initials = (name) => String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?'
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
    for (const row of r.rows) out.push({ object: r.object, label: byName.value.get(r.object)?.label || r.object, channel: channelOf(r.object), action: actionOf(row), time: timeField ? row[timeField] : null, row })
  }
  return out.sort((a, b) => String(b.time ?? '').localeCompare(String(a.time ?? '')))
})
// Message history by channel and action (Marketing Cloud Next): counts, and a filter.
const channels = computed(() => engagementSummary(events.value))
const channelPick = ref('')
const actionPick = ref('')
watch(channelPick, () => { actionPick.value = '' })
const shownEvents = computed(() => events.value.filter((ev) => (!channelPick.value || ev.channel === channelPick.value) && (!actionPick.value || ev.action === actionPick.value)))
const pickedChannel = computed(() => channels.value.find((c) => c.channel === channelPick.value))
const engagementErrors = computed(() => related.value.filter((r) => r.category === 'Engagement' && r.error))
const eventSummary = (row) => Object.entries(row)
  .filter(([k, v]) => v != null && v !== '' && !/Id__c$|^KQ_|DataSource|InternalOrganization|Created|Modified/i.test(k))
  .slice(0, 4).map(([k, v]) => `${k.replace(/^ssot__|__c$/g, '')}: ${v}`).join(' · ')

function toSql(sql) {
  router.push({ path: '/sql', query: { sql } })
}

const profileMd = () => profileMarkdown({ ruleset: ruleset.value, profile: profile.value, related: [...related.value, ...unifiedRelated.value], explanation: explanation.value })

const when = (iso) => (iso ? new Date(iso).toLocaleString() : '')
const card = 'dci-card'
const btn = 'dci-btn'
</script>

<template>
  <section class="space-y-4 max-w-7xl mx-auto">
    <PageHeader path="/profile" title="People" topic="profile">Look up one person in depth, or check a list of up to 1,000.</PageHeader>
    <PeopleTabs />
    <form class="dci-card p-3 flex flex-wrap gap-2 items-center shadow-[0_14px_32px_-22px_rgba(13,148,136,0.45)]" @submit.prevent="submitSearch">
      <label class="dci-search flex-1 min-w-72"><Search class="w-4 h-4 shrink-0 text-teal-700 dark:text-teal-300" aria-hidden="true" /><input v-model="text" placeholder="Email, phone, name or ID (use * as a wildcard)" aria-label="Search people" /></label>
      <label class="text-sm text-muted-foreground" for="rs">Ruleset</label>
      <select id="rs" v-model="rulesetId" class="h-10 max-w-80 rounded-full border bg-card px-3 text-sm" @change="switchRuleset">
        <option v-if="!rulesets.length" value="">No identity resolution rulesets</option>
        <option v-for="r in rulesets" :key="r.id" :value="r.id">{{ r.label }} ({{ r.id }}), last run {{ r.lastJobStatus.toLowerCase() || 'unknown' }}</option>
      </select>
      <button class="dci-btn-primary" :disabled="searching || !org.version">
        {{ searching ? 'Searching…' : 'Search' }}
      </button>
      <button v-if="kept || profile || results" type="button" class="px-1 text-sm font-medium text-link hover:underline" title="Forget the kept search results and profiles" @click="clearSearch">Clear</button>
    </form>
    <div v-if="samples" class="border rounded-xl bg-card p-3 text-sm space-y-2">
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
        @click="go(groupPath(g))"
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
      <nav v-if="keptGroups.length > 1 && keptIndex >= 0" class="dci-card p-2 flex flex-wrap items-center gap-2 text-sm" aria-label="Search results">
        <button class="dci-btn" title="Back to the search results" @click="go('/profile', { q: kept.text })"><List class="w-4 h-4" /> Results</button>
        <button class="p-1.5 rounded-md border hover:bg-accent disabled:opacity-40" :disabled="keptIndex === 0" aria-label="Previous result" @click="goGroup(keptIndex - 1)"><ChevronLeft class="w-4 h-4" /></button>
        <select class="h-8 max-w-[22rem] rounded-md border bg-card px-2 text-sm" aria-label="Go to a result" :value="keptIndex" @change="goGroup(Number($event.target.value))">
          <option v-for="(g, i) in keptGroups" :key="g.unifiedId || g.sources[0].id" :value="i">{{ i + 1 }}. {{ groupName(g) }}</option>
        </select>
        <button class="p-1.5 rounded-md border hover:bg-accent disabled:opacity-40" :disabled="keptIndex >= keptGroups.length - 1" aria-label="Next result" @click="goGroup(keptIndex + 1)"><ChevronRight class="w-4 h-4" /></button>
        <span class="text-muted-foreground">Result {{ keptIndex + 1 }} of {{ keptGroups.length }} for “{{ kept.text }}”</span>
      </nav>
      <div class="flex flex-wrap items-start gap-3">
        <span class="w-14 h-14 shrink-0 rounded-full bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300 flex items-center justify-center text-xl font-bold" aria-hidden="true">{{ initials(title) }}</span>
        <div class="min-w-0">
          <h2 class="text-[28px] leading-9 font-bold break-words">{{ title || '(no name)' }}</h2>
          <div class="text-sm text-muted-foreground">
            <template v-if="profile.unifiedId">Unified profile <span class="font-mono">{{ profile.unifiedId }}</span> from {{ profile.sources.length }} source record{{ profile.sources.length === 1 ? '' : 's' }} ({{ ruleset?.label }})</template>
            <template v-else>Source record <span class="font-mono">{{ profile.sources[0]?.ssot__Id__c }}</span>, <strong>not unified</strong> by {{ ruleset ? ruleset.label : 'any ruleset' }}<span v-if="ruleset"> (last run {{ ruleset.lastJobStatus.toLowerCase() }} {{ when(ruleset.lastJobCompleted) }})</span></template>
          </div>
        </div>
        <div class="ml-auto flex gap-2">
          <a v-if="ruleset?.recordId" class="dci-btn" :href="recordUrl(currentOrg()?.host, ruleset.recordId)" target="_blank" rel="noopener">Open ruleset</a>
          <DownloadMenu :get-markdown="profileMd" :file-name="`profile-${title || 'person'}`" :disabled="!!loading" />
        </div>
      </div>
      <div v-if="notice" class="text-sm text-muted-foreground">{{ notice }}</div>

      <div class="grid lg:grid-cols-2 gap-4">
        <!-- Unified record -->
        <div v-if="profile.unified" :class="card">
          <h3 class="px-5 py-3.5 border-b text-base font-semibold">Unified record</h3>
          <dl class="px-5 py-4 grid grid-cols-[minmax(10rem,auto)_1fr] gap-x-3 gap-y-1 text-sm">
            <template v-for="[k, v] in filled(profile.unified)" :key="k">
              <dt class="font-mono text-xs text-muted-foreground">{{ k }}</dt><dd class="break-all"><RecordLink :value="v" /></dd>
            </template>
          </dl>
        </div>

        <!-- Source records -->
        <div :class="[card, profile.unified ? '' : 'lg:col-span-2']">
          <h3 class="px-5 py-3.5 border-b text-base font-semibold flex items-center gap-2">Source records <span class="dci-count">{{ profile.sources.length }}</span></h3>
          <div v-for="s in profile.sources" :key="s.ssot__Id__c" class="border-b last:border-0">
            <button class="w-full text-left px-5 py-3 flex items-start gap-2 hover:bg-accent" @click="open[s.ssot__Id__c] = !open[s.ssot__Id__c]">
              <component :is="open[s.ssot__Id__c] ? ChevronDown : ChevronRight" class="w-4 h-4 mt-0.5 shrink-0" />
              <div class="min-w-0">
                <div class="font-medium flex items-center gap-2">
                  {{ displayName(s) }}
                  <a v-if="recordKind(s.ssot__Id__c)" :href="recordUrl(currentOrg()?.host, s.ssot__Id__c)" target="_blank" rel="noopener" class="text-xs text-link hover:underline inline-flex items-center gap-1" @click.stop>
                    {{ recordKind(s.ssot__Id__c) }}
                  </a>
                </div>
                <div class="mt-1 flex flex-wrap items-center gap-1.5 text-xs font-mono break-all">
                  <span class="dci-badge font-mono">{{ s.ssot__Id__c }}</span>
                  <span v-if="s.ssot__DataSourceId__c" class="dci-badge dci-badge-blue font-mono">{{ s.ssot__DataSourceId__c }}</span>
                  <span v-if="s.ssot__DataSourceObjectId__c" class="text-muted-foreground">/ {{ s.ssot__DataSourceObjectId__c }}</span>
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
        <h3 class="px-5 py-3.5 border-b text-base font-semibold" data-help="profile-rules">Match rules of {{ ruleset.label }} <HelpTip topic="profile-rules" /></h3>
        <div class="p-5 space-y-4 text-sm">
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
        <h3 class="px-5 py-3.5 border-b text-base font-semibold flex items-center gap-2" data-help="profile-missed">Possible missed matches <span class="dci-count">{{ missed.length }}</span> <HelpTip topic="profile-missed" /></h3>
        <p class="px-5 pt-4 text-xs text-muted-foreground">Other people with the same email who are not in this profile. That is expected when the other criteria differ (for example the names); check the match rules above.</p>
        <ul class="px-5 py-4 text-sm space-y-1">
          <li v-for="m in missed" :key="m.id">
            <button class="text-link hover:underline" @click="go(`/profile/s/${m.id}`)">{{ m.name }}</button>
            <span class="text-muted-foreground ml-1.5">also has {{ m.shared }}</span>
          </li>
        </ul>
      </div>

      <!-- Contact points -->
      <div v-if="contactPoints.length" :class="card">
        <h3 class="px-5 py-3.5 border-b text-base font-semibold">Contact points</h3>
        <div v-for="r in contactPoints" :key="r.object + r.otherField" class="border-b last:border-0 px-5 py-4 space-y-2">
          <div class="text-sm flex items-center gap-2">
            <RouterLink :to="`/objects/${r.object}`" class="font-mono text-link hover:underline">{{ r.object }}</RouterLink>
            <span class="dci-count">{{ r.rows.length }}{{ r.more ? '+' : '' }} rows</span>
            <button v-if="r.sql" class="ml-auto dci-btn dci-btn-sm" @click="toSql(r.sql)"><Code class="w-3.5 h-3.5" /> SQL</button>
          </div>
          <p v-if="r.error" class="text-xs text-destructive">{{ r.error }}</p>
          <RelatedTable :rows="r.rows" />
        </div>
      </div>

      <!-- Consent (Marketing Cloud Next): through the contact points -->
      <div v-if="consent.length || consentLoading || crmConsent" :class="card">
        <h3 class="px-5 py-3.5 border-b text-base font-semibold">Consent</h3>
        <div v-if="crmConsent" class="mx-5 mt-4 rounded-xl bg-muted/60 p-4 flex gap-3">
          <ShieldCheck class="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div class="space-y-1 min-w-0">
          <div class="text-sm"><b>In Salesforce</b> <span class="text-muted-foreground">for <span class="font-mono">{{ [...crmConsent.addresses.emails, ...crmConsent.addresses.phones].join(', ') }}</span></span></div>
          <p v-for="(e, i) in crmConsent.errors" :key="i" class="text-xs text-destructive">{{ e }}</p>
          <p v-if="!crmConsent.rows.length && !crmConsent.errors.length" class="text-sm text-muted-foreground">No subscription or data use consent records for these addresses.</p>
          <ul v-else class="text-sm space-y-0.5">
            <li v-for="r in crmConsent.rows" :key="r.id">
              <b :class="/out|revok|unsub/i.test(r.status) ? 'text-destructive' : ''">{{ r.status || 'no status' }}</b>
              <span class="ml-1.5">{{ r.subscription || r.purpose || r.kind }}</span>
              <span class="text-muted-foreground ml-1.5">{{ [r.kind, r.channel, r.value, r.when && when(r.when), r.source].filter(Boolean).join(' · ') }}</span>
              <a :href="recordUrl(currentOrg()?.host, r.id)" target="_blank" rel="noopener" class="ml-1.5 text-xs text-link hover:underline">Open</a>
            </li>
          </ul>
          </div>
        </div>
        <p v-if="consentLoading" class="px-5 py-3 text-sm text-muted-foreground">Looking for consent records on the contact points…</p>
        <div v-for="r in consent" :key="r.object + r.sql" class="border-b last:border-0 px-5 py-4 space-y-2">
          <div class="text-sm flex items-center gap-2">
            <RouterLink :to="`/objects/${r.object}`" class="font-mono text-link hover:underline">{{ r.object }}</RouterLink>
            <span class="text-muted-foreground">via <span class="font-mono">{{ r.via }}</span></span> <span class="dci-count">{{ r.rows.length }}{{ r.more ? '+' : '' }} rows</span>
            <button v-if="r.sql" class="ml-auto dci-btn dci-btn-sm" @click="toSql(r.sql)"><Code class="w-3.5 h-3.5" /> SQL</button>
          </div>
          <p v-if="r.error" class="text-xs text-destructive">{{ r.error }}</p>
          <ul v-if="r.rows.length" class="grid sm:grid-cols-3 xl:grid-cols-5 gap-2.5 text-sm">
            <li v-for="(row, i) in r.rows.slice(0, 20)" :key="i" class="rounded-xl border p-3 space-y-1.5 min-w-0">
              <div class="text-xs font-bold uppercase tracking-wide truncate" :title="consentFacts(row).subscription">{{ consentFacts(row).subscription || consentFacts(row).channel || 'Consent' }}</div>
              <div :class="['px-2 py-1 rounded-md text-xs font-semibold', /out|revok|unsub/i.test(consentFacts(row).status) ? 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300' : consentFacts(row).status ? 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300' : 'bg-muted text-muted-foreground']">{{ consentFacts(row).status || 'No status field' }}</div>
              <div v-if="consentFacts(row).channel || consentFacts(row).when" class="text-xs text-muted-foreground truncate">{{ [consentFacts(row).channel, consentFacts(row).when && when(consentFacts(row).when)].filter(Boolean).join(' · ') }}</div>
            </li>
          </ul>
          <details class="text-xs"><summary class="cursor-pointer font-semibold text-link">All fields</summary><RelatedTable :rows="r.rows" /></details>
        </div>
      </div>

      <!-- Engagement -->
      <div :class="card">
        <h3 class="px-5 py-3.5 border-b text-base font-semibold flex items-center gap-2">{{ MCN ? 'Message history and engagement' : 'Engagement' }} <span class="dci-count">{{ events.length }}</span></h3>
        <div v-if="MCN && channels.length" class="px-5 pt-4 flex flex-wrap gap-1.5" aria-label="Channels">
          <button :class="['dci-chip h-8 px-3 text-[13px]', !channelPick ? '!bg-primary !text-primary-foreground !border-primary' : '']" :aria-pressed="!channelPick" @click="channelPick = ''">All {{ events.length }}</button>
          <button v-for="c in channels" :key="c.channel" :class="['dci-chip h-8 px-3 text-[13px]', channelPick === c.channel ? '!bg-primary !text-primary-foreground !border-primary' : '']" :aria-pressed="channelPick === c.channel" @click="channelPick = channelPick === c.channel ? '' : c.channel">{{ c.channel }} {{ c.count }}</button>
        </div>
        <div v-if="pickedChannel?.actions.length" class="px-5 pt-2 flex flex-wrap gap-1.5" aria-label="Actions">
          <button v-for="a in pickedChannel.actions" :key="a.action" :class="['dci-chip', actionPick === a.action ? 'is-on' : '']" :aria-pressed="actionPick === a.action" @click="actionPick = actionPick === a.action ? '' : a.action">{{ a.action }} {{ a.count }}</button>
        </div>
        <p v-if="!events.length && !loading" class="px-5 py-4 text-sm text-muted-foreground">No engagement rows for these source records.</p>
        <ul class="text-sm mt-2">
          <li v-for="(ev, i) in shownEvents.slice(0, 200)" :key="i" class="border-t mx-5">
            <button class="w-full text-left py-3 flex gap-4 hover:bg-accent/60 rounded-md" @click="open[`ev${i}`] = !open[`ev${i}`]">
              <span class="w-36 shrink-0"><span class="block text-[13px] font-semibold">{{ ev.time ? new Date(ev.time).toLocaleDateString() : 'no time' }}</span><span class="block text-xs text-muted-foreground">{{ ev.time ? new Date(ev.time).toLocaleTimeString() : '' }}</span></span>
              <span class="min-w-0 flex-1">
                <span class="flex items-center gap-1.5"><Workflow class="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden="true" />{{ ev.label }}<span v-if="ev.action" class="text-muted-foreground"> · {{ ev.action }}</span></span>
                <span class="mt-1 block truncate font-mono text-xs text-muted-foreground">{{ eventSummary(ev.row) }}</span>
              </span>
            </button>
            <dl v-if="open[`ev${i}`]" class="pb-3 grid grid-cols-[minmax(10rem,auto)_1fr] gap-x-3 text-xs">
              <template v-for="[k, v] in filled(ev.row)" :key="k"><dt class="font-mono text-muted-foreground">{{ k }}</dt><dd class="break-all"><RecordLink :value="v" /></dd></template>
            </dl>
          </li>
        </ul>
        <p v-for="r in engagementErrors" :key="r.object" class="px-5 pb-3 text-xs text-destructive">{{ r.object }}: {{ r.error }}</p>
      </div>

      <!-- Segment membership and the rest -->
      <div v-for="group in [{ title: 'Segment membership', list: segments }, { title: 'Other related records', list: others }]" :key="group.title">
        <div v-if="group.list.length" :class="card">
          <h3 class="px-5 py-3.5 border-b text-base font-semibold">{{ group.title }}</h3>
          <div v-for="r in group.list" :key="r.object + r.otherField" class="border-b last:border-0 px-5 py-4 space-y-2">
            <div class="text-sm flex items-center gap-2">
              <RouterLink :to="`/objects/${r.object}`" class="text-link hover:underline">{{ byName.get(r.object)?.label || r.object }}</RouterLink>
              <span class="font-mono text-xs text-muted-foreground">{{ r.object }} by {{ r.otherField }}</span>
              <span class="dci-count">{{ r.rows.length }}{{ r.more ? '+' : '' }} rows</span>
              <button v-if="r.sql" class="ml-auto dci-btn dci-btn-sm" @click="toSql(r.sql)"><Code class="w-3.5 h-3.5" /> SQL</button>
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
