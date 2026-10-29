<script setup>
import DownloadMenu from '../components/DownloadMenu.vue'
import HelpTip from '../components/HelpTip.vue'
import { ref, shallowRef, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Activity, AtSign, Boxes, CalendarClock, Check, ChevronLeft, Code, ChevronRight, Fingerprint, Globe, List, Mail, MapPin, MessageSquare, Phone, Search, ShieldCheck, Users, Workflow } from 'lucide-vue-next'
import PersonSection from '../components/people/PersonSection.vue'
import RowCard from '../components/people/RowCard.vue'
import SideItem from '../components/people/SideItem.vue'
import {
  rowCard, indicators, personFacts, groupContacts, linkRows, emailDomain, membershipFacts, isHistory,
  membershipChanges, engagementTitle, byMonth, plural, isDate,
} from '../lib/personCards.js'
import { useSegments } from '../app/useSegments.js'
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
const allRelated = computed(() => [...unifiedRelated.value, ...related.value])
const labelOf = (name) => byName.value.get(name)?.label || name
const contactEntries = computed(() => withRows(allRelated.value.filter((r) => /ContactPoint/i.test(r.object))))
const segments = computed(() => withRows(allRelated.value.filter((r) => r.category === 'Segment_Membership')))
const others = computed(() => withRows(allRelated.value.filter((r) => !/ContactPoint/i.test(r.object) && r.category !== 'Segment_Membership' && r.category !== 'Engagement')))
const engagementEntries = computed(() => withRows(related.value.filter((r) => r.category === 'Engagement')))
const emptyCount = computed(() => allRelated.value.filter((r) => !r.rows.length && !r.error).length)

// The person's header: short facts and the true/false fields that are true.
const personRows = computed(() => (profile.value ? [profile.value.unified, ...profile.value.sources].filter(Boolean) : []))
const facts = computed(() => personFacts(personRows.value[0]))
const flags = computed(() => [...new Set(personRows.value.flatMap(indicators))])
const showAllSources = ref(false)

// Contact points, one card per address; related rows holding a contact point's ID show on it.
const contacts = computed(() => groupContacts(contactEntries.value).map((c, i) => ({ ...c, i })))
const contactSkip = ['ssot__PartyId__c', 'ssot__EmailAddress__c', 'ssot__TelephoneNumber__c', 'ssot__FormattedE164PhoneNumber__c']
const bigContacts = computed(() => contacts.value.filter((c) => c.kind === 'email'))
const smallContacts = computed(() => contacts.value.filter((c) => c.kind !== 'email'))
const personIds = computed(() => [profile.value?.unifiedId, ...(profile.value?.sources || []).map((s) => s.ssot__Id__c)].filter(Boolean))
const links = computed(() => linkRows(contacts.value, others.value, personIds.value))
const contactCount = computed(() => {
  const n = (k) => contacts.value.filter((c) => c.kind === k).length
  return [[n('email'), 'email'], [n('phone'), 'phone'], [n('address'), 'address'], [n('other'), 'other']]
    .filter(([c]) => c).map(([c, w]) => `${c} ${w}${c === 1 ? '' : w === 'address' ? 'es' : 's'}`).join(' · ')
})
const consentOf = (c) => consent.value.flatMap((e) => e.rows.filter((row) => Object.values(row).some((v) => c.ids.has(String(v))))).map(consentFacts)
const KIND_ICON = { email: Mail, phone: Phone, address: MapPin, other: AtSign }

// The other related objects: rows not shown on a contact card. More than 3 rows go in the
// wide column; rows that carry a date read as a timeline, newest first.
const sections = computed(() => others.value.map((entry) => {
  const rows = entry.rows.filter((r) => !links.value.linked.has(r))
  const dated = rows.filter((r) => rowCard(r, { skip: [entry.otherField] }).date)
  const timeline = rows.length > 1 && dated.length === rows.length
  const dateOf = (r) => rowCard(r, { skip: [entry.otherField] }).date?.value || ''
  return { entry, rows: timeline ? [...rows].sort((a, b) => dateOf(b).localeCompare(dateOf(a))) : rows, linked: entry.rows.length - rows.length, timeline }
}).filter((o) => o.rows.length || o.linked || o.entry.error))
const mainSections = computed(() => sections.value.filter((o) => o.entry.rows.length > 3))
const sideSections = computed(() => sections.value.filter((o) => o.entry.rows.length <= 3))
const countText = (o) => `${o.entry.rows.length}${o.entry.more ? '+' : ''}`

// Segment membership: the latest rows, and the changes in the history rows.
const segmentsNow = computed(() => segments.value.filter((e) => !isHistory(e.object)).flatMap((e) => e.rows.map(membershipFacts)))
const segmentHistory = computed(() => segments.value.filter((e) => isHistory(e.object)).flatMap((e) => e.rows))
const changes = computed(() => membershipChanges(segmentHistory.value))
const showHistory = ref(false)
const segmentList = useSegments()
const segName = (id) => (id ? segmentList.list.find((s) => s.id === id || s.id15 === String(id).slice(0, 15)) : null)
const shortDay = (v) => (isDate(v) ? new Date(v.length === 10 ? `${v}T00:00:00` : v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : v)

// The header tiles; each jumps to its section.
const tiles = computed(() => {
  const out = []
  const n = (k) => contacts.value.filter((c) => c.kind === k).length
  if (n('email')) out.push({ n: n('email'), label: n('email') === 1 ? 'email address' : 'email addresses', icon: Mail, tone: 'bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300', anchor: 'contacts' })
  if (n('phone')) out.push({ n: n('phone'), label: n('phone') === 1 ? 'phone number' : 'phone numbers', icon: Phone, tone: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300', anchor: 'contacts' })
  if (n('address')) out.push({ n: n('address'), label: n('address') === 1 ? 'address' : 'addresses', icon: MapPin, tone: 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300', anchor: 'contacts' })
  const biggest = [...others.value].filter((e) => e.rows.length).sort((a, b) => b.rows.length - a.rows.length)[0]
  if (biggest) out.push({ n: `${biggest.rows.length}${biggest.more ? '+' : ''}`, label: plural(labelOf(biggest.object), biggest.rows.length), icon: Boxes, tone: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300', anchor: biggest.object })
  out.push({ n: events.value.length, label: events.value.length === 1 ? 'engagement' : 'engagements', icon: Activity, tone: 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300', anchor: 'engagement' })
  if (segments.value.length) out.push({ n: segmentsNow.value.length, label: 'segments now', icon: Users, tone: 'bg-pink-50 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300', anchor: 'segments' })
  const topics = consent.value.reduce((t, e) => t + e.rows.length, 0)
  if (topics) out.push({ n: topics, label: 'consent topics', icon: ShieldCheck, tone: 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300', anchor: 'contacts' })
  return out.slice(0, 6)
})

// Engagement from every engagement DMO, newest first.
const events = computed(() => {
  const out = []
  for (const r of related.value.filter((x) => x.category === 'Engagement')) {
    const timeField = eventTimeField(byName.value.get(r.object))
    for (const row of r.rows) out.push({ object: r.object, label: byName.value.get(r.object)?.label || r.object, channel: channelOf(r.object), action: actionOf(row), title: engagementTitle(row), time: timeField ? row[timeField] : null, row })
  }
  return out.sort((a, b) => String(b.time ?? '').localeCompare(String(a.time ?? ''))).map((ev, i) => ({ ...ev, i }))
})
// By channel and action: counts, and a filter.
const channels = computed(() => engagementSummary(events.value))
const channelPick = ref('')
const actionPick = ref('')
watch(channelPick, () => { actionPick.value = ''; eventLimit.value = 50 })
const eventLimit = ref(50)
const shownEvents = computed(() => events.value.filter((ev) => (!channelPick.value || ev.channel === channelPick.value) && (!actionPick.value || ev.action === actionPick.value)))
const months = computed(() => byMonth(shownEvents.value.slice(0, eventLimit.value)))
const pickedChannel = computed(() => channels.value.find((c) => c.channel === channelPick.value))
const channelIcon = (ch) => (/Email/.test(ch) ? 'email' : /SMS|WhatsApp|Messag|Mobile/.test(ch) ? 'msg' : /Web/.test(ch) ? 'web' : 'other')
const CHANNEL_ICON = { email: Mail, msg: MessageSquare, web: Globe, other: Workflow }
const CHANNEL_TONE = {
  email: 'bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
  msg: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  web: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  other: 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
}

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

    <!-- Profile: cards (design "Option D – People (cards)") -->
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
      <!-- The person -->
      <section class="dci-card relative overflow-hidden p-[22px] flex flex-col gap-[18px] shadow-[0_14px_32px_-22px_rgba(124,58,237,0.5)]">
        <div aria-hidden="true" class="absolute -top-[60px] left-10 w-[520px] max-w-[70%] h-40 rounded-full bg-violet-500/10 blur-[48px] pointer-events-none" />
        <div class="relative flex flex-wrap items-start justify-between gap-4">
          <div class="flex items-center gap-4 min-w-0">
            <span class="w-16 h-16 shrink-0 rounded-full bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300 flex items-center justify-center text-[22px] font-bold" aria-hidden="true">{{ initials(title) }}</span>
            <div class="flex flex-col gap-1.5 min-w-0">
              <h2 class="text-[28px] leading-[34px] font-bold tracking-tight break-words">{{ title || '(no name)' }}</h2>
              <div class="flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
                <template v-if="profile.unifiedId">Unified profile <code class="font-mono text-foreground break-all">{{ profile.unifiedId }}</code>
                  <span class="dci-badge dci-badge-violet">{{ profile.sources.length }} source record{{ profile.sources.length === 1 ? '' : 's' }} · {{ ruleset?.label }}</span>
                </template>
                <template v-else>Source record <code class="font-mono text-foreground break-all">{{ profile.sources[0]?.ssot__Id__c }}</code>
                  <span class="dci-badge dci-badge-amber" :title="ruleset ? `Last run ${ruleset.lastJobStatus.toLowerCase()} ${when(ruleset.lastJobCompleted)}` : ''">Not unified by {{ ruleset ? ruleset.label : 'any ruleset' }}</span>
                </template>
                <span v-for="f in facts" :key="f.label" class="dci-badge">{{ f.label }} {{ f.value }}</span>
              </div>
            </div>
          </div>
          <div class="flex gap-2">
            <a v-if="ruleset?.recordId" class="dci-btn" :href="recordUrl(currentOrg()?.host, ruleset.recordId)" target="_blank" rel="noopener">Open ruleset</a>
            <DownloadMenu :get-markdown="profileMd" :file-name="`profile-${title || 'person'}`" :disabled="!!loading" />
          </div>
        </div>
        <div v-if="tiles.length" class="relative grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5">
          <a v-for="t in tiles" :key="t.label" :href="`#pp-${t.anchor}`" class="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border bg-card hover:bg-accent no-underline text-foreground">
            <span :class="['w-8 h-8 shrink-0 rounded-xl flex items-center justify-center', t.tone]" aria-hidden="true"><component :is="t.icon" class="w-4 h-4" /></span>
            <span class="flex flex-col min-w-0"><span class="text-lg font-bold leading-[22px] tabular-nums">{{ t.n }}</span><span class="text-xs text-muted-foreground truncate">{{ t.label }}</span></span>
          </a>
        </div>
        <div v-if="flags.length" class="relative flex flex-wrap items-center gap-2">
          <span class="text-xs font-semibold text-muted-foreground" title="True/false fields that are true on the person's record">Indicators</span>
          <span v-for="f in flags" :key="f" class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border text-muted-foreground"><Check class="w-3 h-3" aria-hidden="true" />{{ f }}</span>
        </div>
      </section>
      <div v-if="notice" class="text-sm text-muted-foreground">{{ notice }}</div>

      <!-- Source records -->
      <PersonSection id="pp-sources" title="Source records" :count="profile.sources.length" :icon="Fingerprint" tone="violet">
        <template #table>
          <RelatedTable :rows="[...(profile.unified ? [profile.unified] : []), ...profile.sources]" :max="50" />
        </template>
        <template #actions><button type="button" class="dci-btn dci-btn-sm" :aria-pressed="showAllSources" @click="showAllSources = !showAllSources">{{ showAllSources ? 'Hide fields' : 'All fields' }}</button></template>
        <div class="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          <div v-for="s in profile.sources" :key="s.ssot__Id__c" class="flex flex-col gap-2 p-3.5 rounded-xl border min-w-0">
            <div class="flex items-center justify-between gap-2">
              <span :class="['text-sm font-semibold break-words', displayName(s) === '(no name)' ? 'italic text-muted-foreground' : '']">{{ displayName(s) }}</span>
              <a v-if="recordKind(s.ssot__Id__c)" :href="recordUrl(currentOrg()?.host, s.ssot__Id__c)" target="_blank" rel="noopener" class="text-xs text-link hover:underline">{{ recordKind(s.ssot__Id__c) }}</a>
            </div>
            <span v-if="s.ssot__DataSourceId__c" class="dci-badge dci-badge-blue font-mono self-start max-w-full truncate">{{ s.ssot__DataSourceId__c }}</span>
            <code v-if="s.ssot__DataSourceObjectId__c" class="font-mono text-[11px] text-muted-foreground break-all">{{ s.ssot__DataSourceObjectId__c }}</code>
            <span class="text-xs text-muted-foreground">ID <code class="font-mono text-[11px] text-foreground break-all">{{ s.ssot__Id__c }}</code> · {{ filled(s).length }} fields</span>
            <span v-if="linkFor(s.ssot__Id__c)?.MatchKeys__c" class="text-xs text-muted-foreground">Match keys <code class="font-mono text-[11px] text-foreground">{{ linkFor(s.ssot__Id__c).MatchKeys__c }}</code></span>
            <dl v-if="showAllSources" class="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-3 gap-y-0.5 text-xs pt-1 border-t">
              <template v-for="[k, v] in filled(s)" :key="k"><dt class="font-mono text-muted-foreground break-all">{{ k }}</dt><dd class="break-all"><RecordLink :value="v" /></dd></template>
            </dl>
          </div>
        </div>
        <details v-if="profile.unified" class="mt-3 text-sm">
          <summary class="cursor-pointer font-semibold text-link text-xs">Unified record fields</summary>
          <dl class="mt-2 grid grid-cols-[minmax(10rem,auto)_1fr] gap-x-3 gap-y-0.5 text-xs">
            <template v-for="[k, v] in filled(profile.unified)" :key="k"><dt class="font-mono text-muted-foreground">{{ k }}</dt><dd class="break-all"><RecordLink :value="v" /></dd></template>
          </dl>
        </details>
      </PersonSection>

      <div class="flex flex-wrap items-start gap-5">
        <!-- Main column -->
        <div class="flex-[999_1_620px] min-w-0 flex flex-col gap-5">
          <!-- Contact points -->
          <PersonSection v-if="contactEntries.length" id="pp-contacts" title="Contact points" :count="contactCount" :icon="AtSign" tone="teal" :entries="contactEntries" :label="labelOf">
            <div class="flex flex-col gap-3.5">
              <div v-for="c in bigContacts" :key="c.i" class="flex flex-col gap-3.5 p-4 rounded-[14px] border border-teal-200 dark:border-teal-500/30 bg-gradient-to-b from-teal-50/70 to-transparent dark:from-teal-500/10">
                <div class="flex items-center gap-3 min-w-0">
                  <span class="w-10 h-10 shrink-0 rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300 flex items-center justify-center" aria-hidden="true"><component :is="KIND_ICON[c.kind]" class="w-5 h-5" /></span>
                  <div class="flex flex-col gap-0.5 min-w-0">
                    <span class="text-[17px] font-bold break-all">{{ c.value || '(no value)' }}</span>
                    <span class="text-xs text-muted-foreground">{{ [emailDomain(c.value), `found in ${c.sources.length} source${c.sources.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ') }}</span>
                  </div>
                  <span v-if="c.primary" class="ml-auto dci-badge dci-badge-teal">Primary</span>
                </div>
                <div class="flex flex-col gap-1.5">
                  <div v-for="s in c.sources" :key="s.object + s.id" class="flex flex-wrap items-center gap-2 px-2.5 py-2 rounded-lg bg-muted/50">
                    <span v-if="s.dataSource" class="dci-badge dci-badge-blue font-mono">{{ s.dataSource }}</span>
                    <span class="text-xs text-muted-foreground">ID <code class="font-mono text-[11px] text-foreground break-all">{{ s.id }}</code></span>
                    <span v-for="ch in rowCard(s.row, { skip: contactSkip }).chips.filter((x) => x.tone !== 'blue')" :key="ch.text" class="dci-badge">{{ ch.text }}</span>
                    <span class="dci-badge font-mono">{{ labelOf(s.object) }}</span>
                  </div>
                </div>
                <div v-if="consentOf(c).length" class="flex flex-col gap-2">
                  <span class="flex items-center gap-1.5 text-xs font-semibold"><ShieldCheck class="w-3.5 h-3.5" aria-hidden="true" />Consent</span>
                  <div class="flex flex-wrap gap-1.5">
                    <span v-for="(f, j) in consentOf(c)" :key="j" :class="['inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold', /out|revok|unsub/i.test(f.status) ? 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300' : 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300']">{{ f.subscription || f.channel || 'Consent' }}<span class="font-medium opacity-85">{{ f.status || 'no status' }}</span></span>
                  </div>
                </div>
                <template v-if="links.byContact.get(c.i)">
                  <RowCard v-for="(l, j) in links.byContact.get(c.i)" :key="j" :row="l.row" :skip="[l.entry.otherField]" :cols="3"><span class="text-[11px] text-muted-foreground">From {{ labelOf(l.entry.object) }}</span></RowCard>
                </template>
              </div>
              <div v-if="smallContacts.length" class="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                <div v-for="c in smallContacts" :key="c.i" class="flex flex-col gap-2.5 p-3.5 rounded-[14px] border bg-card min-w-0">
                  <div class="flex items-center gap-2.5 min-w-0">
                    <span class="w-[34px] h-[34px] shrink-0 rounded-xl bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300 flex items-center justify-center" aria-hidden="true"><component :is="KIND_ICON[c.kind]" class="w-4 h-4" /></span>
                    <div class="flex flex-col min-w-0">
                      <span class="text-[15px] font-bold tabular-nums break-words">{{ c.value || '(no value)' }}</span>
                      <span class="text-[11px] text-muted-foreground">{{ c.sources.length }} source{{ c.sources.length === 1 ? '' : 's' }} · ID <code class="font-mono break-all">{{ c.sources[0].id }}</code></span>
                    </div>
                    <span v-if="c.primary" class="ml-auto dci-badge dci-badge-teal">Primary</span>
                  </div>
                  <template v-for="(l, j) in links.byContact.get(c.i) || []" :key="j">
                    <dl class="grid grid-cols-2 gap-2 p-2.5 rounded-[10px] bg-muted/50">
                      <div v-for="f in rowCard(l.row, { skip: [l.entry.otherField], maxFields: 4 }).fields" :key="f.key" class="min-w-0">
                        <dt class="text-[11px] text-muted-foreground truncate" :title="f.key">{{ f.label }}</dt>
                        <dd :class="['text-[13px] font-medium break-words', f.mono ? 'font-mono' : '']">{{ f.value }}</dd>
                      </div>
                    </dl>
                    <div class="flex flex-wrap gap-1.5">
                      <span class="dci-badge dci-badge-blue font-mono">{{ labelOf(l.entry.object) }} {{ rowCard(l.row).id }}</span>
                      <span v-for="ch in rowCard(l.row, { skip: [l.entry.otherField] }).chips.filter((x) => x.tone !== 'blue')" :key="ch.text" class="dci-badge">{{ ch.text }}</span>
                    </div>
                  </template>
                  <div class="flex flex-wrap gap-1.5">
                    <span v-for="s in c.sources" :key="s.object + s.id" class="dci-badge font-mono">{{ s.dataSource || labelOf(s.object) }}</span>
                  </div>
                  <div v-if="consentOf(c).length" class="flex flex-wrap gap-1.5">
                    <span v-for="(f, j) in consentOf(c)" :key="j" :class="['dci-badge', /out|revok|unsub/i.test(f.status) ? 'dci-badge-red' : 'dci-badge-green']">{{ f.subscription || f.channel || 'Consent' }} {{ f.status }}</span>
                  </div>
                </div>
              </div>
            </div>
          </PersonSection>


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
          <!-- Larger related objects -->
          <PersonSection v-for="o in mainSections" :id="`pp-${o.entry.object}`" :key="o.entry.object + o.entry.otherField" :title="labelOf(o.entry.object)" :count="countText(o)" :icon="Boxes" tone="blue" :entries="[o.entry]" :label="labelOf">
            <div class="flex flex-col gap-4">
              <div v-if="o.linked" class="flex items-center gap-3 px-3.5 py-3 rounded-xl bg-blue-50 dark:bg-blue-500/10">
                <span class="text-[22px] font-bold text-blue-700 dark:text-blue-300">{{ o.linked }}</span>
                <span class="text-sm">shown on the contact point cards above</span>
              </div>
              <ol v-if="o.timeline" class="flex flex-col">
                <li v-for="(row, j) in o.rows" :key="j" class="grid grid-cols-[14px_minmax(0,1fr)] gap-2.5">
                  <span class="w-2.5 h-2.5 mt-1.5 rounded-full border-2 border-orange-600 bg-card" aria-hidden="true" />
                  <RowCard :row="row" :skip="[o.entry.otherField]" :cols="3" class="mb-2.5" />
                </li>
              </ol>
              <div v-else class="grid sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                <RowCard v-for="(row, j) in o.rows" :key="j" :row="row" :skip="[o.entry.otherField]" />
              </div>
            </div>
          </PersonSection>

          <!-- Engagement -->
          <PersonSection id="pp-engagement" :title="MCN ? 'Message history and engagement' : 'Engagement'" :count="events.length" :icon="Activity" tone="orange" :entries="engagementEntries" :label="labelOf" pad="px-5 pt-1.5 pb-4">
            <template #actions>
              <div v-if="channels.length > 1" class="flex flex-wrap gap-1.5" aria-label="Channels">
                <button type="button" :class="['h-8 px-3 rounded-full border text-[13px] font-semibold', !channelPick ? 'bg-teal-700 border-teal-700 text-white' : 'bg-card']" :aria-pressed="!channelPick" @click="channelPick = ''">All {{ events.length }}</button>
                <button v-for="c in channels" :key="c.channel" type="button" :class="['h-8 px-3 rounded-full border text-[13px] font-semibold', channelPick === c.channel ? 'bg-teal-700 border-teal-700 text-white' : 'bg-card']" :aria-pressed="channelPick === c.channel" @click="channelPick = channelPick === c.channel ? '' : c.channel">{{ c.channel }} {{ c.count }}</button>
              </div>
            </template>
            <div v-if="MCN && pickedChannel?.actions.length" class="pt-2 flex flex-wrap gap-1.5" aria-label="Actions">
              <button v-for="a in pickedChannel.actions" :key="a.action" type="button" :class="['dci-chip', actionPick === a.action ? 'is-on' : '']" :aria-pressed="actionPick === a.action" @click="actionPick = actionPick === a.action ? '' : a.action">{{ a.action }} {{ a.count }}</button>
            </div>
            <p v-if="!events.length && !loading" class="py-3 text-sm text-muted-foreground">No engagement rows for these source records.</p>
            <template v-for="m in months" :key="m.month">
              <div class="pt-3.5 pb-1.5 text-xs font-bold tracking-wider uppercase text-muted-foreground">{{ m.month }}</div>
              <div v-for="ev in m.items" :key="ev.i" class="border-t">
                <button type="button" class="w-full text-left grid grid-cols-[34px_92px_minmax(0,1fr)] gap-3 items-start py-2.5 hover:bg-accent/60 rounded-md" :aria-expanded="!!open[`ev${ev.i}`]" @click="open[`ev${ev.i}`] = !open[`ev${ev.i}`]">
                  <span :class="['w-[34px] h-[34px] rounded-[10px] flex items-center justify-center', CHANNEL_TONE[channelIcon(ev.channel)]]" aria-hidden="true"><component :is="CHANNEL_ICON[channelIcon(ev.channel)]" class="w-4 h-4" /></span>
                  <span class="flex flex-col"><span class="text-[13px] font-semibold">{{ ev.time ? new Date(ev.time).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'No time' }}</span><span class="text-[11px] text-muted-foreground">{{ ev.time ? new Date(ev.time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '' }}</span></span>
                  <span class="flex flex-col gap-1.5 min-w-0">
                    <span class="text-sm font-medium break-words">{{ ev.title || ev.label }}</span>
                    <span class="flex flex-wrap gap-1.5">
                      <span v-if="ev.action" class="dci-badge">{{ ev.action }}</span>
                      <span v-if="ev.row.ssot__DataSourceId__c" class="dci-badge dci-badge-blue">{{ ev.row.ssot__DataSourceId__c }}</span>
                      <span v-if="ev.title" class="dci-badge">{{ ev.label }}</span>
                    </span>
                  </span>
                </button>
                <dl v-if="open[`ev${ev.i}`]" class="pb-3 pl-[150px] grid grid-cols-[minmax(10rem,auto)_1fr] gap-x-3 text-xs">
                  <template v-for="[k, v] in filled(ev.row)" :key="k"><dt class="font-mono text-muted-foreground">{{ k }}</dt><dd class="break-all"><RecordLink :value="v" /></dd></template>
                </dl>
              </div>
            </template>
            <button v-if="shownEvents.length > eventLimit" type="button" class="mt-3 dci-btn dci-btn-sm" @click="eventLimit += 50">Show 50 more ({{ shownEvents.length - eventLimit }} left)</button>
          </PersonSection>

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
        </div>

        <!-- Side column -->
        <div class="flex-[1_1_300px] min-w-0 flex flex-col gap-5">
          <!-- Segment membership -->
          <PersonSection v-if="segments.length" id="pp-segments" title="Segment membership" :count="`${segmentsNow.length} now`" :icon="Users" tone="pink" :entries="segments" :label="labelOf" pad="px-[18px] py-4" compact>
            <p v-if="!segmentsNow.length" class="text-sm text-muted-foreground">In no segment now.</p>
            <div class="-mt-2.5">
              <div v-for="(m, j) in segmentsNow" :key="j" class="flex flex-col gap-1 py-2.5 border-t first:border-0">
                <div class="flex items-center justify-between gap-2">
                  <RouterLink v-if="segName(m.segment)" :to="`/segments/${segName(m.segment).apiName}`" class="text-sm text-link hover:underline break-words">{{ segName(m.segment).label }}</RouterLink>
                  <code v-else class="font-mono text-xs break-all">{{ m.segment || '(no segment ID)' }}</code>
                  <span v-if="m.kind" :class="['dci-badge', m.kind === 'new' ? 'dci-badge-green' : '']">{{ m.kind }}</span>
                </div>
                <span class="text-[11px] text-muted-foreground">{{ [m.since && `Since ${m.since.slice(0, 10)}`, m.parent && `parent ${m.parent}`, segName(m.segment) && m.segment].filter(Boolean).join(' · ') }}</span>
              </div>
            </div>
            <div v-if="segmentHistory.length" class="flex flex-col gap-3 pt-3 border-t">
              <span class="text-xs font-semibold">Recent changes</span>
              <p v-if="!changes.length" class="text-xs text-muted-foreground">No adds or removals in the history rows read.</p>
              <div v-for="c in changes" :key="c.segment" class="flex flex-col gap-1.5">
                <span class="text-xs font-mono break-all">{{ segName(c.segment)?.label || c.segment }}</span>
                <div class="flex flex-wrap gap-2.5">
                  <span v-for="(e, j) in c.events" :key="j" class="inline-flex items-center gap-1 text-[11px]"><span :class="['w-2 h-2 rounded-full', e.kind === 'removed' ? 'bg-red-600' : 'bg-green-600']" aria-hidden="true" />{{ shortDay(e.when) }} {{ e.kind }}<template v-if="e.parent"> under {{ e.parent.slice(-4) }}</template></span>
                  <span v-if="c.since" class="inline-flex items-center gap-1 text-[11px]"><span class="w-2 h-2 rounded-full bg-gray-400" aria-hidden="true" />{{ c.since }} snapshot{{ c.since === 1 ? '' : 's' }} since</span>
                </div>
              </div>
              <button type="button" class="self-start text-xs font-semibold text-link hover:underline" :aria-expanded="showHistory" @click="showHistory = !showHistory">{{ showHistory ? 'Hide history rows' : `Show all ${segmentHistory.length} history rows` }}</button>
              <RelatedTable v-if="showHistory" :rows="segmentHistory" :max="100" />
            </div>
          </PersonSection>

          <!-- Smaller related objects -->
          <PersonSection v-for="o in sideSections" :id="`pp-${o.entry.object}`" :key="o.entry.object + o.entry.otherField" :title="labelOf(o.entry.object)" :count="countText(o)" :icon="o.timeline ? CalendarClock : Boxes" :tone="o.timeline ? 'orange' : 'green'" :entries="[o.entry]" :label="labelOf" pad="px-[18px] py-4" compact>
            <p v-if="o.linked" class="mb-3 text-xs text-muted-foreground">{{ o.linked }} shown on the contact point cards.</p>
            <ol v-if="o.timeline" class="flex flex-col">
              <li v-for="(row, j) in o.rows" :key="j" class="grid grid-cols-[14px_minmax(0,1fr)] gap-2.5 pb-3">
                <span class="w-2.5 h-2.5 mt-1 rounded-full border-2 border-orange-600 bg-card" aria-hidden="true" />
                <SideItem :row="row" :skip="[o.entry.otherField]" />
              </li>
            </ol>
            <div v-else class="flex flex-col">
              <div v-for="(row, j) in o.rows" :key="j" class="py-2.5 border-t first:border-0 first:pt-0"><SideItem :row="row" :skip="[o.entry.otherField]" /></div>
            </div>
          </PersonSection>
        </div>
      </div>
      <p v-if="!loading && emptyCount" class="text-xs text-muted-foreground text-center">{{ emptyCount }} other related objects have no rows for this person.</p>
    </template>
  </section>
</template>
