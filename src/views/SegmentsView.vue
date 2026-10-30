<script setup>
import { badgeClass } from '../lib/badges.js'
import PageHeader from '../components/PageHeader.vue'
import SqlBlock from '../components/SqlBlock.vue'
import Loading from '../components/Loading.vue'
import JsonViewer from '../components/JsonViewer.vue'
import HelpTip from '../components/HelpTip.vue'
import DownloadMenu from '../components/DownloadMenu.vue'
import { docFrom, sheetsFrom } from '../lib/tableDoc.js'
import { ref, computed, watch, onMounted } from 'vue'
import ListPanel from '../components/ListPanel.vue'
import DataTable from '../components/DataTable.vue'
import { useRoute, useRouter } from 'vue-router'
import { ChevronDown, ChevronRight, Copy, ExternalLink, RefreshCw, Search } from 'lucide-vue-next'
import { useOrg, currentOrg, orgTitle } from '../app/useOrg.js'
import { useCatalog, ensureCatalog, orgCall } from '../app/useCatalog.js'
import { runQuery } from '../lib/query.js'
import { recordUrl } from '../lib/links.js'
import { inSpace } from '../lib/dataSpace.js'
import { parseRulesets, search, INDIVIDUAL } from '../lib/profile.js'
import { useSegments, ensureSegments } from '../app/useSegments.js'
import {
  describeCriteria, topConditions, segmentSql, publishPoints, membershipTables, membershipCount, publishHistory, checkMembers, personHistory, segmentNames, loadMembers, membersSql, loadMatching, matchingSql,
  SEGMENT_SORTS, sortSegments,
} from '../lib/segments.js'

const route = useRoute()
const router = useRouter()
const org = useOrg()
const catalog = useCatalog()

// Shown as they load, and loading goes on on other pages (feedback #1005).
const store = useSegments()
const segments = computed(() => store.list)
const loading = computed(() => store.loading)
const error = computed(() => store.error)
const filter = ref('')
const q = async (sql) => runQuery(orgCall(), org.version, sql, { rowLimit: 2000 })

const detail = ref(null) // { latest, history, latestCount, countNow, countError, versions, loading }
const showRaw = ref(false)
const who = ref('')
const checking = ref(false)
const checkResult = ref(null) // { rows: [{ name, id, member, memberSince, matchesNow, failing }], note }
const notice = ref('')
// Who is in the segment (feedback #1031): pages of 100 from the latest membership table, on request.
const PAGE = 100
const members = ref(null) // { rows, loading, error, done, source: 'table' | 'criteria' }
const memberCols = computed(() => [{ key: 'name', label: 'Name' }, { key: 'id', label: 'ID' }, ...(members.value?.source === 'criteria' ? [] : [{ key: 'since', label: 'In the segment since' }])])

const load = (refresh = false) => ensureSegments({ refresh }).catch(() => { /* shown from store.error */ })
onMounted(() => { ensureCatalog(); load() })
watch(() => [org.orgId, org.version, org.dataSpace], () => load())

// Sort (feedback #121), remembered in this browser.
// Criteria fold (feedback #1025): folded until opened, remembered in this browser.
const criteriaOpen = ref((() => { try { return localStorage.getItem('dci_segCriteriaOpen') === '1' } catch { return false } })())
watch(criteriaOpen, (v) => { try { localStorage.setItem('dci_segCriteriaOpen', v ? '1' : '0') } catch { /* private window */ } })
const sortBy = ref((() => { try { return localStorage.getItem('dci_segmentSort') || 'name' } catch { return 'name' } })())
watch(sortBy, (v) => { try { localStorage.setItem('dci_segmentSort', v) } catch { /* private window */ } })
const sortDate = (s) => {
  const v = { created: s.created, published: s.lastPublished, modified: s.modified }[sortBy.value]
  return v ? new Date(v).toLocaleDateString() : sortBy.value === 'name' || sortBy.value === 'members' ? '' : 'never'
}
const list = computed(() => {
  const t = filter.value.trim().toLowerCase()
  const found = t ? segments.value.filter((s) => s.label.toLowerCase().includes(t) || s.apiName.toLowerCase().includes(t) || s.id.toLowerCase().startsWith(t)) : segments.value
  return sortSegments(found, sortBy.value)
})
const seg = computed(() => segments.value.find((s) => s.apiName === route.params.name) || null)
const lines = computed(() => (seg.value ? describeCriteria(seg.value.criteria) : []))
const conditions = computed(() => (seg.value ? topConditions(seg.value.criteria) : []))
const sql = computed(() => (seg.value && catalog.objects.length ? segmentSql(seg.value, catalog.objects) : null))

let seq = 0
watch([seg, () => catalog.objects.length], async () => {
  const s = seg.value
  checkResult.value = null
  members.value = null
  notice.value = ''
  if (!s || !catalog.objects.length) { detail.value = null; return }
  const my = ++seq
  const t = membershipTables(s, catalog.objects)
  detail.value = { ...t, latestCount: null, countNow: null, countError: '', versions: null, loading: true }
  const [latestCount, versions] = await Promise.all([
    membershipCount(q, t.latest, s).catch(() => null),
    publishHistory(q, t.history, s).catch(() => []),
  ])
  if (my === seq) Object.assign(detail.value, { latestCount, versions, loading: false })
}, { immediate: true })

async function countNow() {
  if (!sql.value || sql.value.error) return
  detail.value.countNow = 'counting'
  try {
    const r = await q(sql.value.count)
    detail.value.countNow = Number(r.rows[0]?.[0] ?? 0)
  } catch (err) {
    detail.value.countNow = null
    detail.value.countError = err.message
  }
}

// "Is this person in the segment?": find them like Profiles does, then check membership and
// the criteria for the IDs of the object the segment is on.
async function check() {
  const s = seg.value
  if (!who.value.trim() || !s) return
  checking.value = true
  checkResult.value = null
  try {
    const rulesets = parseRulesets(inSpace((await orgCall()(`/services/data/v${org.version}/ssot/identity-resolutions`)).data?.identityResolutions, org.dataSpace))
    const unifiedRs = rulesets.find((r) => r.unified === s.on)
    let people = [] // [{ id, name }]
    let note = ''
    if (s.on === INDIVIDUAL || unifiedRs) {
      const found = await search(q, who.value, unifiedRs || null)
      people = found.groups.flatMap((g) => (unifiedRs
        ? (g.unifiedId ? [{ id: g.unifiedId, name: g.sources.map((x) => x.name).join(', ') }] : [])
        : g.sources.map((x) => ({ id: x.id, name: x.name }))))
      if (unifiedRs && found.groups.some((g) => !g.unifiedId)) note = 'Some matches are not unified by this ruleset, so they cannot be members.'
    } else {
      people = [{ id: who.value.trim(), name: who.value.trim() }]
      note = `This segment is on ${s.on}; enter that object's record ID.`
    }
    if (!people.length) { checkResult.value = { rows: [], note: note || 'Nobody found.' }; return }
    // The same person can come from several data sources under one ID: check each ID once.
    people = [...new Map(people.map((p) => [p.id, p])).values()]
    const ids = people.map((p) => p.id).slice(0, 50)
    if (people.length > 50) note = [note, `${people.length} people found; checking the first 50. Use an email or ID to narrow it down.`].filter(Boolean).join(' ')
    // The membership history (feedback #1028): this segment and segments nested under it.
    const [rows, history] = await Promise.all([
      checkMembers(q, s, catalog.objects, ids, detail.value?.latest),
      personHistory(q, detail.value?.history, ids, s).catch(() => null),
    ])
    // Only this segment (feedback #1030): its own history rows, or rows of segments nested
    // under it (Parent_Segment_Id__c). Names come from the segment list, else from MarketSegment.
    const mine = (e) => e.segmentId === s.id15 || e.parentId === s.id15
    const entries = ids.flatMap((id) => (history?.get(id) || []).filter(mine))
    const byId = new Map(segments.value.map((x) => [x.id15, x.label]))
    const missing = entries.map((e) => e.segmentId).filter((i) => !byId.has(i))
    const extra = missing.length ? await segmentNames(orgCall(), org.version, missing).catch(() => new Map()) : new Map()
    const nameOf = (i) => byId.get(i) || extra.get(i) || ''
    checkResult.value = {
      historyTable: detail.value?.history || '',
      historyError: history === null,
      rows: rows.map((r) => {
        const here = (history?.get(r.id) || []).filter(mine).map((e) => ({ ...e, name: nameOf(e.segmentId), nested: e.segmentId !== s.id15 }))
        return { ...r, name: people.find((p) => p.id === r.id)?.name || r.id, here: here.find((e) => !e.nested) || null, nested: here.filter((e) => e.nested) }
      }),
      note,
    }
  } catch (err) {
    checkResult.value = { rows: [], note: `Could not check: ${err.message}` }
  } finally {
    checking.value = false
  }
}

function verdict(r) {
  // No latest-membership row, but the history says the last publish kept them in.
  if (!r.member && r.here && !r.here.leaving && isLatestPublish(r.here)) return r.matchesNow === false ? 'Member (from the history), but no longer matches: leaves at the next publish' : 'Member (from the history)'
  if (r.member && r.matchesNow === false) return 'Member, but no longer matches: leaves at the next publish'
  if (r.member) return 'Member'
  if (r.matchesNow) return 'Not a member yet, but matches now: joins at the next publish'
  if (r.matchesNow === false) return 'Not a member, and does not match'
  return 'Not a member (the criteria could not be checked)'
}

// Whether a history entry is from the segment's latest publish (when the publish history is known).
function isLatestPublish(e) {
  const v = detail.value?.versions?.[0]?.version
  return v == null || String(e.version) === String(v)
}

function historyLine(e) {
  const bits = [`latest publish with them ${when(e.at) || e.version}`]
  if (e.delta) bits.push(e.delta.toLowerCase())
  if (e.publishes > 1) bits.push(`${e.publishes} history rows`)
  return bits.join(', ')
}

// Membership tables are filled only when a segment publishes (feedback #1033). Without
// members there, the people matching the criteria now are offered instead.
async function moreMembers(source = members.value?.source || 'table') {
  const s = seg.value
  const table = detail.value?.latest
  if (!s || (source === 'table' && !table)) return
  if (!members.value || members.value.source !== source) members.value = { rows: [], loading: false, error: '', done: false, source }
  const m = members.value // the reactive copy, so changes show
  m.loading = true
  m.error = ''
  try {
    const opts = { limit: PAGE, offset: m.rows.length }
    const page = source === 'criteria' ? await loadMatching(q, s, catalog.objects, opts) : await loadMembers(q, s, catalog.objects, table, opts)
    if (seg.value !== s) return
    m.rows.push(...page.map((r) => ({ ...r, since: when(r.since) })))
    m.done = page.length < PAGE
  } catch (err) {
    m.error = err.message
  } finally {
    m.loading = false
  }
}

function toSql(text) { router.push({ path: '/sql', query: { sql: text } }) }
async function copy(text, what) { await navigator.clipboard.writeText(text); notice.value = `Copied ${what}.` }

const when = (iso) => (iso ? new Date(iso).toLocaleString() : '')
const num = (n) => (typeof n === 'number' ? n.toLocaleString() : '')
const card = 'dci-card'
const btn = 'dci-btn'
// Publish history chart with a hover card per publish (feedback #1038).
const points = computed(() => publishPoints(detail.value?.versions))
const hovered = ref(-1)
const hoverPoint = computed(() => points.value[hovered.value] || null)
const signed = (n) => (n > 0 ? `+${num(n)}` : n < 0 ? `−${num(-n)}` : '0')
const pctText = (p) => (p == null ? '' : ` (${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p) < 10 ? Math.abs(p).toFixed(1) : Math.round(Math.abs(p))}%)`)

const versionCols = [
  { key: 'at', label: 'Published', kind: 'date', value: (v) => when(v.at), sortValue: (v) => v.at, filter: false },
  { key: 'size', label: 'Members', align: 'right', kind: 'number' },
  { key: 'members', label: 'Rows', align: 'right', kind: 'number' },
  { key: 'changes', label: 'Changes', value: (v) => `${/^f/i.test(v.snapshot || '') ? 'full, ' : v.snapshot ? 'incremental, ' : ''}${Object.entries(v.deltas).map(([k, n]) => `${num(n)} ${k}`).join(', ')}` },
  { key: 'version', label: 'Version' },
]

// Downloads (feedback #149): the list as filtered and sorted, and one segment
const listCols = [
  { key: 'label', label: 'Segment' }, { key: 'apiName', label: 'API name' },
  { key: 'lastCount', label: 'Members at publish', value: (s) => num(s.lastCount) },
  { key: 'publishStatus', label: 'Publish status' }, { key: 'lastPublished', label: 'Last published', value: (s) => when(s.lastPublished) },
  { key: 'publishInterval', label: 'Schedule', value: (s) => s.publishInterval.replace(/_/g, ' ').toLowerCase() },
  { key: 'on', label: 'Segment on' }, { key: 'status', label: 'Status' }, { key: 'type', label: 'Type' },
  { key: 'created', label: 'Created', value: (s) => when(s.created) }, { key: 'modified', label: 'Modified', value: (s) => when(s.modified) },
]
const listSections = () => [{ heading: 'Segments', columns: listCols, rows: list.value }]
const listDoc = () => docFrom({ title: 'Segments', intro: `${orgTitle(org.orgId)}, data space ${org.dataSpace || 'default'}. ${list.value.length} segments${filter.value.trim() ? ` matching "${filter.value.trim()}"` : ''}.`, sections: listSections() })
function segSections() {
  const s = seg.value
  const d = detail.value
  return [
    { heading: 'Details', kv: [['API name', s.apiName], ['Segment ID', s.id], ['Segment on', s.on], ['Status', s.status.toLowerCase()], ['Last published', `${when(s.lastPublished) || 'never'} (${s.publishStatus.toLowerCase()})`], ['Schedule', s.publishInterval.replace(/_/g, ' ').toLowerCase()], ['Members at publish', num(s.lastCount)], ['In the membership table now', d?.latest ? num(d.latestCount) : 'no table found'], ['Matching the criteria now', typeof d?.countNow === 'number' ? num(d.countNow) : 'not counted'], ['Type', `${s.type}${s.lookback ? `, lookback ${s.lookback}` : ''}`], ['Created', when(s.created)], ['Modified', when(s.modified)]] },
    { heading: 'Criteria', list: lines.value.map((l) => `${'  '.repeat(l.depth)}${l.text}`) },
    ...(sql.value && !sql.value.error ? [{ heading: 'Equivalent SQL', code: sql.value.select, lang: 'sql' }] : []),
    { heading: 'Publish history', columns: versionCols, rows: d?.versions || [], empty: 'No publishes recorded.' },
  ]
}
const segDoc = () => docFrom({ title: `Segment: ${seg.value.label}`, intro: `${orgTitle(org.orgId)}, data space ${org.dataSpace || 'default'}.`, sections: segSections() })
</script>

<template>
  <div class="space-y-5">
  <PageHeader path="/segments" topic="segments">Every segment with its criteria in plain words and as SQL, counts at the last publish and membership.</PageHeader>
  <section class="flex gap-4 min-h-0">
    <ListPanel name="segments" label="segments list">
      <div class="flex gap-2">
        <label class="dci-search flex-1 min-w-0"><Search class="w-4 h-4 shrink-0 text-teal-700 dark:text-teal-300" aria-hidden="true" /><input v-model="filter" placeholder="Search segments" /></label>
        <button class="dci-btn-icon" title="Load the segments again" @click="load(true)">
          <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" />
        </button>
      </div>
      <p class="text-xs text-muted-foreground"><strong class="text-foreground">{{ list.length.toLocaleString() }} of {{ segments.length.toLocaleString() }}</strong> segments<template v-if="loading">, {{ store.storedAt ? `saved ${new Date(store.storedAt).toLocaleString()}, updating` : 'loading' }} {{ store.total ? `${store.loaded.toLocaleString()} of ${store.total.toLocaleString()}` : `more (${store.loaded.toLocaleString()} so far)` }}…</template></p>
      <div class="flex flex-wrap items-center gap-2 text-xs">
        <label class="text-muted-foreground" for="seg-sort">Sort</label>
        <select id="seg-sort" v-model="sortBy" class="h-8 min-w-0 flex-1 rounded-full border bg-card px-2.5 text-xs"><option v-for="o in SEGMENT_SORTS" :key="o.id" :value="o.id">{{ o.label }}</option></select>
        <DownloadMenu small label="Download" :get-doc="listDoc" :get-sheets="() => sheetsFrom(listSections())" file-name="segments" :disabled="!list.length" />
      </div>
      <p v-if="error" class="text-xs text-destructive">{{ error }}</p>
      <ul class="max-h-[75vh] overflow-auto text-sm">
        <li
          v-for="s in list" :key="s.apiName"
          :class="['px-2.5 py-1.5 rounded-lg cursor-pointer border', s.apiName === seg?.apiName ? 'bg-teal-50 border-teal-200 dark:bg-teal-500/10 dark:border-teal-500/30' : 'border-transparent hover:bg-accent']"
          @click="router.push(`/segments/${s.apiName}`)"
        >
          <div class="flex gap-2"><span class="truncate">{{ s.label }}</span><span v-if="sortDate(s)" class="ml-auto shrink-0 text-xs text-muted-foreground">{{ sortDate(s) }}</span></div>
          <div class="text-xs text-muted-foreground truncate">{{ num(s.lastCount) }} members · <span :class="/success/i.test(s.publishStatus) ? 'font-semibold text-green-700 dark:text-green-400' : ''">{{ s.publishStatus.toLowerCase() || 'not published' }}</span> · {{ s.on.replace(/^ssot__|__dlm$/g, '') }}</div>
        </li>
      </ul>
    </ListPanel>

    <div class="flex-1 min-w-0 space-y-4">
      <p v-if="!seg" class="dci-card text-sm text-muted-foreground p-8 text-center min-h-[40vh] flex items-center justify-center">
        {{ loading && !segments.length ? 'Loading segments…' : loading && route.params.name ? `Loading segments: ${store.loaded.toLocaleString()} so far, ${route.params.name} not among them yet…` : segments.length ? 'Pick a segment to see its criteria, counts, publish history, and check whether someone is in it.' : 'No segments in this org.' }}
      </p>

      <template v-else>
        <div class="flex flex-wrap items-start gap-3">
          <div class="min-w-0 space-y-1">
            <h2 class="text-2xl font-bold leading-[30px] break-words">{{ seg.label }}</h2>
            <div class="font-mono text-[13px] text-muted-foreground break-all">{{ seg.apiName }}<template v-if="seg.id"> · ID {{ seg.id }} <button class="dci-btn-icon align-middle" title="Copy segment ID" aria-label="Copy segment ID" @click="copy(seg.id, 'the segment ID')"><Copy class="w-3.5 h-3.5" /></button></template></div>
            <div class="flex flex-wrap gap-1.5">
              <span :class="badgeClass(seg.status)">{{ seg.status.toLowerCase() }}</span>
              <span :class="badgeClass(seg.publishStatus || 'not published')">{{ seg.publishStatus.toLowerCase() || 'not published' }}</span>
              <span class="dci-badge">{{ seg.on.replace(/^ssot__|__dlm$/g, '') }}</span>
            </div>
          </div>
          <div class="ml-auto flex items-center gap-2">
            <DownloadMenu :get-doc="segDoc" :get-sheets="() => sheetsFrom(segSections())" :file-name="`segment-${seg.apiName}`" />
            <a v-if="seg.id" class="dci-btn-icon" :href="recordUrl(currentOrg()?.host, seg.id)" target="_blank" rel="noopener" title="Open in Salesforce" aria-label="Open in Salesforce"><ExternalLink class="w-4 h-4" /></a>
          </div>
        </div>
        <p v-if="notice" class="text-sm text-muted-foreground">{{ notice }}</p>

        <div v-expand :class="card">
          <h3 class="px-5 py-3.5 border-b text-base font-semibold" data-help="segment-counts">Counts <HelpTip topic="segment-counts" /></h3>
          <div class="p-5 space-y-3 text-sm">
            <div class="grid sm:grid-cols-3 gap-3">
              <div class="rounded-xl border p-3.5"><div class="text-xs text-muted-foreground">At the last publish</div><div class="text-2xl font-bold mt-1">{{ num(seg.lastCount) }}</div></div>
              <div class="rounded-xl border p-3.5"><div class="text-xs text-muted-foreground">In the membership table now</div><div class="text-2xl font-bold mt-1">{{ detail?.loading ? '…' : detail?.latest ? num(detail.latestCount) : '—' }}</div><div v-if="!detail?.loading && !detail?.latest" class="text-xs text-muted-foreground">no table found</div></div>
              <div class="rounded-xl border p-3.5"><div class="text-xs text-muted-foreground">Matching the criteria now</div><div class="text-2xl font-bold mt-1">{{ detail?.countNow === 'counting' ? '…' : num(detail?.countNow) }}</div><button v-if="sql && !sql.error" class="dci-btn dci-btn-sm mt-2" :disabled="detail?.countNow === 'counting'" @click="countNow">Count now</button></div>
            </div>
            <p v-if="detail?.countError" class="text-xs text-destructive">{{ detail.countError }}</p>
            <p v-if="typeof detail?.countNow === 'number' && seg.lastCount != null && detail.countNow !== seg.lastCount" class="text-xs">
              The criteria match {{ num(Math.abs(detail.countNow - seg.lastCount)) }} {{ detail.countNow > seg.lastCount ? 'more' : 'fewer' }} records now than at the last publish: data changed since, or the SQL below differs from how Data Cloud reads a rule.
            </p>
            <div v-if="sql">
              <div class="text-muted-foreground mb-1">Equivalent SQL</div>
              <p v-if="sql.error" class="text-xs">Not available: {{ sql.error }}.</p>
              <template v-else>
                <SqlBlock :code="sql.select" box-class="max-h-80" />
                <div class="flex gap-2 mt-2">
                  <button :class="btn" @click="toSql(sql.select)">Open in SQL</button>
                  <button :class="btn" @click="copy(sql.select, 'the SQL')">Copy SQL</button>
                </div>
                <p class="text-xs text-muted-foreground mt-1">Built from the criteria; text comparisons are case-insensitive here. Use it to see who matches, not as Data Cloud's own query.</p>
              </template>
            </div>
          </div>
        </div>

        <div v-expand :class="card">
          <h3 class="px-5 py-3.5 border-b text-base font-semibold" data-help="segment-check">Is this person in the segment? <HelpTip topic="segment-check" /></h3>
          <form class="p-3 flex gap-2" @submit.prevent="check">
            <input v-model="who" placeholder="Email, phone, name or ID" class="flex-1 border rounded-md px-2 py-1 bg-background text-sm" />
            <button class="dci-btn-primary" :disabled="checking || !who.trim()">{{ checking ? 'Checking…' : 'Check' }}</button>
          </form>
          <div v-if="checkResult" class="px-3 pb-3 space-y-2 text-sm">
            <p v-if="checkResult.note" class="text-xs text-muted-foreground">{{ checkResult.note }}</p>
            <p v-if="checkResult.historyTable" class="text-xs text-muted-foreground">Membership read from the latest table and the history table <span class="font-mono">{{ checkResult.historyTable }}</span>{{ checkResult.historyError ? ' (the history could not be read)' : '' }}.</p>
            <div v-for="r in checkResult.rows" :key="r.id" class="border rounded-md p-2">
              <div class="flex flex-wrap items-baseline gap-2">
                <RouterLink :to="seg.on === 'ssot__Individual__dlm' ? `/profile/s/${r.id}` : `/profile/u/${r.id}`" class="text-link hover:underline">{{ r.name }}</RouterLink>
                <span class="font-mono text-xs text-muted-foreground">{{ r.id }}</span>
                <span class="ml-auto">{{ verdict(r) }}</span>
              </div>
              <div v-if="r.memberSince" class="text-xs text-muted-foreground">In the membership table since {{ when(r.memberSince) }}</div>
              <ul v-if="r.failing.length" class="text-xs mt-1 list-disc pl-5">
                <li v-for="i in r.failing" :key="i">Fails: <span class="font-mono">{{ describeCriteria(conditions[i]).map((l) => l.text).join(' ') }}</span></li>
              </ul>
              <div v-if="r.here" class="text-xs text-muted-foreground mt-1">History: {{ historyLine(r.here) }}{{ r.here.leaving ? ' (left)' : '' }}</div>
              <div v-if="r.nested.length" class="mt-1 text-xs">
                <div class="font-medium">In segments nested under this one</div>
                <ul class="mt-0.5 space-y-0.5">
                  <li v-for="e in r.nested" :key="e.segmentId" class="flex flex-wrap gap-x-2">
                    <span>{{ e.name || 'Unnamed segment' }}</span>
                    <span class="font-mono text-muted-foreground">{{ e.segmentId }}</span>
                    <span class="text-muted-foreground">{{ historyLine(e) }}</span>
                    <span v-if="e.leaving" class="dci-badge dci-badge-amber">left</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div v-expand :class="card">
          <h3 class="px-5 py-3.5 border-b text-base font-semibold flex items-center gap-2">Members <span v-if="members?.rows.length" class="dci-count">{{ members.rows.length.toLocaleString() }}{{ members.done ? '' : '+' }}</span></h3>
          <div class="p-3 space-y-2 text-sm">
            <p v-if="!detail?.loading && (!detail?.latest || detail.latestCount === 0)" class="text-muted-foreground">
              {{ detail?.latest ? 'The membership table has nobody for this segment' : `No membership table found for ${seg.on}` }}{{ /success/i.test(seg.publishStatus) ? '.' : ': Data Cloud fills it only when a segment publishes, and this one has not published successfully.' }}
              The member count comes from Data Cloud's own count. You can list the people matching the criteria now instead.
            </p>
            <template v-if="detail && !detail.loading">
              <div class="flex flex-wrap gap-2">
                <button v-if="detail.latest && detail.latestCount !== 0 && members?.source !== 'table'" class="dci-btn" @click="moreMembers('table')">Show members</button>
                <button v-if="members?.source !== 'criteria'" class="dci-btn" :disabled="!!sql?.error" :title="sql?.error || 'People matching the criteria now (from the SQL built from the criteria)'" @click="moreMembers('criteria')">Show who matches the criteria now</button>
                <button v-if="members?.source === 'criteria' && !matchingSql(seg, catalog.objects).error" class="dci-btn" @click="toSql(matchingSql(seg, catalog.objects, { limit: 1000 }).sql)">Open in SQL</button>
                <button v-else-if="detail.latest" class="dci-btn" @click="toSql(membersSql(seg, detail.latest, { limit: 1000 }))">Open in SQL</button>
              </div>
              <p v-if="sql?.error && members?.source !== 'table'" class="text-xs text-muted-foreground">Matching the criteria cannot be listed: {{ sql.error }}</p>
              <p v-if="members?.error" class="text-destructive">{{ members.error }}</p>
              <DataTable v-if="members?.rows.length" :columns="memberCols" :rows="members.rows" :row-key="(r) => r.id" text-size="text-xs">
                <template #cell-name="{ row }">
                  <RouterLink :to="seg.on === 'ssot__Individual__dlm' ? `/profile/s/${row.id}` : `/profile/u/${row.id}`" class="text-link hover:underline">{{ row.name || '(no name)' }}</RouterLink>
                </template>
                <template #cell-id="{ row }"><span class="font-mono">{{ row.id }}</span></template>
              </DataTable>
              <p v-else-if="members && !members.loading && !members.error" class="text-muted-foreground">{{ members.source === 'criteria' ? 'Nobody matches the criteria now.' : 'Nobody in the membership table for this segment.' }}</p>
              <Loading v-if="members?.loading" text="Loading members…" />
              <button v-else-if="members?.rows.length && !members.done" class="dci-btn" @click="moreMembers">Load {{ PAGE }} more</button>
              <p v-if="members?.rows.length" class="text-xs text-muted-foreground">{{ members.source === 'criteria' ? `Matching the criteria now (approximate, from the SQL built from the criteria), not the published membership` : `From ${detail.latest}` }}; {{ PAGE }} at a time in ID order. Sorting and filters apply to the rows loaded.</p>
            </template>
          </div>
        </div>

        <div v-expand :class="card">
          <h3 class="px-5 py-3.5 border-b text-base font-semibold">Publish history</h3>
          <Loading v-if="detail?.loading" text="Loading…" />
          <p v-else-if="!detail?.history" class="p-3 text-sm text-muted-foreground">No history table found for {{ seg.on }}.</p>
          <p v-else-if="!detail.versions?.length" class="p-3 text-sm text-muted-foreground">No publishes recorded in {{ detail.history }}.</p>
          <div v-else-if="detail.versions.length > 1" class="p-3">
            <div class="flex items-baseline justify-between text-xs text-muted-foreground mb-1"><span>Size over time</span><span>Hover a bar for its numbers</span></div>
            <div class="relative" @mouseleave="hovered = -1">
              <div class="flex items-end gap-0.5 h-28" role="list" aria-label="Members at each publish">
                <button
                  v-for="(p, i) in points" :key="p.version" type="button" role="listitem"
                  class="flex-1 min-w-1 h-full flex items-end focus:outline-none group"
                  :aria-label="`${when(p.at)}: ${num(p.size)} members`"
                  @mouseenter="hovered = i" @focus="hovered = i" @blur="hovered = -1"
                >
                  <span :class="['w-full rounded-t-sm', hovered === i ? 'bg-teal-600 dark:bg-teal-400' : 'bg-foreground/60 group-hover:bg-foreground/80']" :style="{ height: `${Math.max(2, p.height * 100)}%` }" />
                </button>
              </div>
              <div
                v-if="hoverPoint" class="absolute bottom-full mb-2 z-20 w-64 rounded-lg border bg-popover text-popover-foreground shadow-lg p-2.5 text-xs pointer-events-none"
                :style="{ left: `clamp(0px, calc(${((hovered + 0.5) / points.length) * 100}% - 8rem), calc(100% - 16rem))` }"
              >
                <div class="font-semibold text-sm">{{ num(hoverPoint.size) }} members</div>
                <div class="text-muted-foreground">{{ when(hoverPoint.at) }}</div>
                <dl class="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                  <dt class="text-muted-foreground">Change</dt>
                  <dd :class="hoverPoint.change > 0 ? 'text-emerald-700 dark:text-emerald-400' : hoverPoint.change < 0 ? 'text-rose-700 dark:text-rose-400' : ''">{{ hoverPoint.change == null ? 'first publish shown' : `${signed(hoverPoint.change)}${pctText(hoverPoint.pct)} since the publish before` }}</dd>
                  <dt class="text-muted-foreground">Snapshot</dt><dd>{{ hoverPoint.full ? 'full' : hoverPoint.snapshot ? 'incremental' : 'unknown' }}</dd>
                  <dt class="text-muted-foreground">Rows</dt><dd>{{ num(hoverPoint.members) }}<template v-if="hoverPoint.breakdown.length">: {{ hoverPoint.breakdown.map((b) => `${num(b.n)} ${b.type}`).join(', ') }}</template></dd>
                  <dt class="text-muted-foreground">Publish</dt><dd>{{ hovered + 1 }} of {{ points.length }}</dd>
                  <dt class="text-muted-foreground">Version</dt><dd class="font-mono break-all">{{ hoverPoint.version }}</dd>
                </dl>
              </div>
            </div>
            <div class="flex justify-between text-xs text-muted-foreground mt-1"><span>{{ when(detail.versions.at(-1).at) }}</span><span>{{ when(detail.versions[0].at) }}</span></div>
          </div>
          <DataTable v-if="detail?.versions?.length" :columns="versionCols" :rows="detail.versions" row-key="version" :bordered="false" box-class="max-h-[60vh]">
            <template #cell-size="{ value }"><span class="font-medium">{{ num(value) }}</span></template>
            <template #cell-members="{ value }">{{ num(value) }}</template>
            <template #cell-changes="{ value }"><span class="text-xs">{{ value }}</span></template>
            <template #cell-version="{ value }"><span class="font-mono text-xs text-muted-foreground">{{ value }}</span></template>
          </DataTable>
          <p v-if="detail?.history" class="px-3 pb-3 pt-1 text-xs text-muted-foreground">From <RouterLink :to="`/objects/${detail.history}`" class="text-link hover:underline font-mono">{{ detail.history }}</RouterLink>.</p>
        </div>
        <dl class="dci-card dci-kv px-5 pt-1 pb-2">
          <div v-if="seg.id"><dt>Segment ID</dt><dd class="font-mono text-[13px] break-all">{{ seg.id }}<span v-if="seg.id15 !== seg.id" class="text-muted-foreground"> (15 characters: {{ seg.id15 }})</span></dd></div>
          <div><dt>Segment on</dt><dd><RouterLink :to="`/objects/${seg.on}`" class="text-link hover:underline font-mono text-[13px]">{{ seg.on }}</RouterLink></dd></div>
          <div><dt>Status</dt><dd class="inline-flex items-center gap-1.5"><span :class="['w-2 h-2 rounded-full', /active/i.test(seg.status) ? 'bg-green-600' : 'bg-gray-400']" />{{ seg.status.toLowerCase() }}</dd></div>
          <div><dt>Last published</dt><dd>{{ when(seg.lastPublished) || 'never' }} ({{ seg.publishStatus.toLowerCase() || 'not published' }})</dd></div>
          <div><dt>Schedule</dt><dd>{{ seg.publishInterval.replace(/_/g, ' ').toLowerCase() }}</dd></div>
          <div><dt>Members at publish</dt><dd class="font-semibold">{{ num(seg.lastCount) }}</dd></div>
          <div><dt>Type</dt><dd>{{ seg.type }}{{ seg.lookback ? `, lookback ${seg.lookback}` : '' }}</dd></div>
          <div><dt>Created</dt><dd>{{ when(seg.created) }}</dd></div>
          <div><dt>Modified</dt><dd>{{ when(seg.modified) }}</dd></div>
        </dl>

        <div v-expand :class="card">
          <h3 :class="['px-5 py-3.5 text-base font-semibold flex items-center gap-2', criteriaOpen ? 'border-b' : '']">
            <button class="inline-flex items-center gap-1.5 hover:underline" :aria-expanded="criteriaOpen" @click="criteriaOpen = !criteriaOpen"><component :is="criteriaOpen ? ChevronDown : ChevronRight" class="w-4 h-4" /> Criteria</button>
            <button v-if="criteriaOpen" class="ml-auto text-xs text-link hover:underline font-semibold" @click="showRaw = !showRaw">{{ showRaw ? 'Hide' : 'Show' }} raw JSON</button>
          </h3>
          <div v-if="criteriaOpen" class="p-5 space-y-1 text-sm">
            <div v-for="(l, i) in lines" :key="i" :style="{ paddingLeft: `${l.depth * 1.25}rem` }">
              <span class="font-mono text-xs">{{ l.text }}</span>
              <pre v-if="l.raw" class="text-xs text-muted-foreground whitespace-pre-wrap">{{ l.raw }}</pre>
            </div>
            <div v-if="showRaw" class="mt-2"><JsonViewer :value="{ include: seg.criteria, exclude: seg.excludeCriteria }" :file-name="`segment-${seg.apiName || seg.label}-criteria`" :open-depth="4" box-class="max-h-96" /></div>
          </div>
        </div>

      </template>
    </div>
  </section>
  </div>
</template>
