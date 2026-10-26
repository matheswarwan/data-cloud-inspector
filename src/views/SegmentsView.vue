<script setup>
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
import { RefreshCw } from 'lucide-vue-next'
import { useOrg, currentOrg, orgTitle } from '../app/useOrg.js'
import { useCatalog, ensureCatalog, orgCall } from '../app/useCatalog.js'
import { runQuery } from '../lib/query.js'
import { recordUrl } from '../lib/links.js'
import { inSpace } from '../lib/dataSpace.js'
import { parseRulesets, search, INDIVIDUAL } from '../lib/profile.js'
import { useSegments, ensureSegments } from '../app/useSegments.js'
import {
  describeCriteria, topConditions, segmentSql, membershipTables, membershipCount, publishHistory, checkMembers,
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

const load = (refresh = false) => ensureSegments({ refresh }).catch(() => { /* shown from store.error */ })
onMounted(() => { ensureCatalog(); load() })
watch(() => [org.orgId, org.version, org.dataSpace], () => load())

// Sort (feedback #121), remembered in this browser.
const sortBy = ref((() => { try { return localStorage.getItem('dci_segmentSort') || 'name' } catch { return 'name' } })())
watch(sortBy, (v) => { try { localStorage.setItem('dci_segmentSort', v) } catch { /* private window */ } })
const sortDate = (s) => {
  const v = { created: s.created, published: s.lastPublished, modified: s.modified }[sortBy.value]
  return v ? new Date(v).toLocaleDateString() : sortBy.value === 'name' || sortBy.value === 'members' ? '' : 'never'
}
const list = computed(() => {
  const t = filter.value.trim().toLowerCase()
  const found = t ? segments.value.filter((s) => s.label.toLowerCase().includes(t) || s.apiName.toLowerCase().includes(t)) : segments.value
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
    const rows = await checkMembers(q, s, catalog.objects, people.map((p) => p.id).slice(0, 50), detail.value?.latest)
    checkResult.value = { rows: rows.map((r) => ({ ...r, name: people.find((p) => p.id === r.id)?.name || r.id })), note }
  } catch (err) {
    checkResult.value = { rows: [], note: `Could not check: ${err.message}` }
  } finally {
    checking.value = false
  }
}

function verdict(r) {
  if (r.member && r.matchesNow === false) return 'Member, but no longer matches: leaves at the next publish'
  if (r.member) return 'Member'
  if (r.matchesNow) return 'Not a member yet, but matches now: joins at the next publish'
  if (r.matchesNow === false) return 'Not a member, and does not match'
  return 'Not a member (the criteria could not be checked)'
}

function toSql(text) { router.push({ path: '/sql', query: { sql: text } }) }
async function copy(text, what) { await navigator.clipboard.writeText(text); notice.value = `Copied ${what}.` }

const when = (iso) => (iso ? new Date(iso).toLocaleString() : '')
const num = (n) => (typeof n === 'number' ? n.toLocaleString() : '')
const card = 'border rounded-md bg-card'
const btn = 'inline-flex items-center px-2.5 py-1.5 rounded-md border text-sm hover:bg-accent disabled:opacity-50'
const versionCols = [
  { key: 'at', label: 'Published', kind: 'date', value: (v) => when(v.at), sortValue: (v) => v.at, filter: false },
  { key: 'size', label: 'Members', align: 'right', kind: 'number' },
  { key: 'members', label: 'Rows', align: 'right', kind: 'number' },
  { key: 'changes', label: 'Changes', value: (v) => `${v.snapshot === 'F' ? 'full, ' : v.snapshot ? 'incremental, ' : ''}${Object.entries(v.deltas).map(([k, n]) => `${num(n)} ${k}`).join(', ')}` },
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
    { heading: 'Details', kv: [['API name', s.apiName], ['Segment on', s.on], ['Status', s.status.toLowerCase()], ['Last published', `${when(s.lastPublished) || 'never'} (${s.publishStatus.toLowerCase()})`], ['Schedule', s.publishInterval.replace(/_/g, ' ').toLowerCase()], ['Members at publish', num(s.lastCount)], ['In the membership table now', d?.latest ? num(d.latestCount) : 'no table found'], ['Matching the criteria now', typeof d?.countNow === 'number' ? num(d.countNow) : 'not counted'], ['Type', `${s.type}${s.lookback ? `, lookback ${s.lookback}` : ''}`], ['Created', when(s.created)], ['Modified', when(s.modified)]] },
    { heading: 'Criteria', list: lines.value.map((l) => `${'  '.repeat(l.depth)}${l.text}`) },
    ...(sql.value && !sql.value.error ? [{ heading: 'Equivalent SQL', code: sql.value.select, lang: 'sql' }] : []),
    { heading: 'Publish history', columns: versionCols, rows: d?.versions || [], empty: 'No publishes recorded.' },
  ]
}
const segDoc = () => docFrom({ title: `Segment: ${seg.value.label}`, intro: `${orgTitle(org.orgId)}, data space ${org.dataSpace || 'default'}.`, sections: segSections() })
</script>

<template>
  <section class="flex gap-4 min-h-0">
    <ListPanel name="segments" label="segments list">
      <div class="flex gap-2">
        <input v-model="filter" placeholder="Search segments" class="flex-1 border rounded-md px-2 py-1 bg-background text-sm" />
        <button class="p-1.5 rounded-md border hover:bg-accent" title="Load the segments again" @click="load(true)">
          <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" />
        </button>
      </div>
      <div class="flex items-center gap-2 text-xs">
        <span class="text-muted-foreground">{{ list.length.toLocaleString() }} of {{ segments.length.toLocaleString() }} segments<template v-if="loading">, loading {{ store.total ? `${store.loaded.toLocaleString()} of ${store.total.toLocaleString()}` : `more (${store.loaded.toLocaleString()} so far)` }}…</template></span>
        <label class="ml-auto text-muted-foreground" for="seg-sort">Sort</label>
        <select id="seg-sort" v-model="sortBy" class="border rounded px-1 py-0.5 bg-background"><option v-for="o in SEGMENT_SORTS" :key="o.id" :value="o.id">{{ o.label }}</option></select>
        <DownloadMenu small :get-doc="listDoc" :get-sheets="() => sheetsFrom(listSections())" file-name="segments" :disabled="!list.length" />
      </div>
      <p v-if="error" class="text-xs text-destructive">{{ error }}</p>
      <ul class="max-h-[75vh] overflow-auto text-sm">
        <li
          v-for="s in list" :key="s.apiName"
          :class="['px-2 py-1.5 rounded-md cursor-pointer hover:bg-accent', { 'bg-accent': s.apiName === seg?.apiName }]"
          @click="router.push(`/segments/${s.apiName}`)"
        >
          <div class="flex gap-2"><span class="truncate">{{ s.label }}</span><span v-if="sortDate(s)" class="ml-auto shrink-0 text-xs text-muted-foreground">{{ sortDate(s) }}</span></div>
          <div class="text-xs text-muted-foreground truncate">{{ num(s.lastCount) }} members · {{ s.publishStatus.toLowerCase() || 'not published' }} · {{ s.on.replace(/^ssot__|__dlm$/g, '') }}</div>
        </li>
      </ul>
    </ListPanel>

    <div class="flex-1 min-w-0 space-y-4">
      <p v-if="!seg" class="text-sm text-muted-foreground p-4">
        {{ loading && !segments.length ? 'Loading segments…' : loading && route.params.name ? `Loading segments: ${store.loaded.toLocaleString()} so far, ${route.params.name} not among them yet…` : segments.length ? 'Pick a segment to see its criteria, counts, publish history, and check whether someone is in it.' : 'No segments in this org.' }}
      </p>

      <template v-else>
        <div class="flex flex-wrap items-start gap-3">
          <div class="min-w-0">
            <h2 class="text-lg font-semibold">{{ seg.label }}</h2>
            <div class="font-mono text-sm text-muted-foreground">{{ seg.apiName }}</div>
          </div>
          <div class="ml-auto flex gap-2">
            <DownloadMenu :get-doc="segDoc" :get-sheets="() => sheetsFrom(segSections())" :file-name="`segment-${seg.apiName}`" />
            <a v-if="seg.id" :class="btn" :href="recordUrl(currentOrg()?.host, seg.id)" target="_blank" rel="noopener">Open in Salesforce</a>
          </div>
        </div>
        <p v-if="notice" class="text-sm text-muted-foreground">{{ notice }}</p>

        <dl :class="[card, 'p-3 grid grid-cols-[10rem_1fr] md:grid-cols-[10rem_1fr_10rem_1fr] gap-x-3 gap-y-1 text-sm']">
          <dt class="text-muted-foreground">Segment on</dt><dd><RouterLink :to="`/objects/${seg.on}`" class="text-link hover:underline font-mono text-xs">{{ seg.on }}</RouterLink></dd>
          <dt class="text-muted-foreground">Status</dt><dd>{{ seg.status.toLowerCase() }}</dd>
          <dt class="text-muted-foreground">Last published</dt><dd>{{ when(seg.lastPublished) || 'never' }} ({{ seg.publishStatus.toLowerCase() }})</dd>
          <dt class="text-muted-foreground">Schedule</dt><dd>{{ seg.publishInterval.replace(/_/g, ' ').toLowerCase() }}</dd>
          <dt class="text-muted-foreground">Members at publish</dt><dd>{{ num(seg.lastCount) }}</dd>
          <dt class="text-muted-foreground">Type</dt><dd>{{ seg.type }}{{ seg.lookback ? `, lookback ${seg.lookback}` : '' }}</dd>
          <dt class="text-muted-foreground">Created</dt><dd>{{ when(seg.created) }}</dd>
          <dt class="text-muted-foreground">Modified</dt><dd>{{ when(seg.modified) }}</dd>
        </dl>

        <div :class="card">
          <h3 class="p-3 border-b font-medium flex items-center">Criteria
            <button class="ml-auto text-xs text-link hover:underline font-normal" @click="showRaw = !showRaw">{{ showRaw ? 'Hide' : 'Show' }} raw JSON</button>
          </h3>
          <div class="p-3 space-y-1 text-sm">
            <div v-for="(l, i) in lines" :key="i" :style="{ paddingLeft: `${l.depth * 1.25}rem` }">
              <span class="font-mono text-xs">{{ l.text }}</span>
              <pre v-if="l.raw" class="text-xs text-muted-foreground whitespace-pre-wrap">{{ l.raw }}</pre>
            </div>
            <div v-if="showRaw" class="mt-2"><JsonViewer :value="{ include: seg.criteria, exclude: seg.excludeCriteria }" :file-name="`segment-${seg.apiName || seg.label}-criteria`" :open-depth="4" box-class="max-h-96" /></div>
          </div>
        </div>

        <div :class="card">
          <h3 class="p-3 border-b font-medium" data-help="segment-counts">Counts <HelpTip topic="segment-counts" /></h3>
          <div class="p-3 space-y-3 text-sm">
            <table class="text-sm">
              <tr><td class="pr-6 py-0.5 text-muted-foreground">At the last publish</td><td class="text-right">{{ num(seg.lastCount) }}</td></tr>
              <tr><td class="pr-6 py-0.5 text-muted-foreground">In the membership table now</td><td class="text-right">{{ detail?.loading ? '…' : detail?.latest ? num(detail.latestCount) : 'no table found' }}</td></tr>
              <tr>
                <td class="pr-6 py-0.5 text-muted-foreground">Matching the criteria now</td>
                <td class="text-right">{{ detail?.countNow === 'counting' ? '…' : num(detail?.countNow) }}</td>
                <td class="pl-4"><button v-if="sql && !sql.error" :class="btn" :disabled="detail?.countNow === 'counting'" @click="countNow">Count now</button></td>
              </tr>
            </table>
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

        <div :class="card">
          <h3 class="p-3 border-b font-medium" data-help="segment-check">Is this person in the segment? <HelpTip topic="segment-check" /></h3>
          <form class="p-3 flex gap-2" @submit.prevent="check">
            <input v-model="who" placeholder="Email, phone, name or ID" class="flex-1 border rounded-md px-2 py-1 bg-background text-sm" />
            <button class="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50" :disabled="checking || !who.trim()">{{ checking ? 'Checking…' : 'Check' }}</button>
          </form>
          <div v-if="checkResult" class="px-3 pb-3 space-y-2 text-sm">
            <p v-if="checkResult.note" class="text-xs text-muted-foreground">{{ checkResult.note }}</p>
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
            </div>
          </div>
        </div>

        <div :class="card">
          <h3 class="p-3 border-b font-medium">Publish history</h3>
          <Loading v-if="detail?.loading" text="Loading…" />
          <p v-else-if="!detail?.history" class="p-3 text-sm text-muted-foreground">No history table found for {{ seg.on }}.</p>
          <p v-else-if="!detail.versions?.length" class="p-3 text-sm text-muted-foreground">No publishes recorded in {{ detail.history }}.</p>
          <div v-else-if="detail.versions.length > 1" class="p-3">
            <div class="text-xs text-muted-foreground mb-1">Size over time</div>
            <div class="flex items-end gap-0.5 h-28">
              <div
                v-for="v in [...detail.versions].reverse()" :key="v.version" class="flex-1 min-w-1 bg-foreground/60 rounded-t-sm"
                :style="{ height: `${Math.max(2, (v.size / Math.max(1, ...detail.versions.map((x) => x.size))) * 100)}%` }"
                :title="`${when(v.at)}: ${num(v.size)} members`"
              />
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
      </template>
    </div>
  </section>
</template>
