<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import HelpTip from '../components/HelpTip.vue'
import ListPanel from '../components/ListPanel.vue'
import DataTable from '../components/DataTable.vue'
import { useRoute, useRouter } from 'vue-router'
import { RefreshCw, X, Check } from 'lucide-vue-next'
import PersonPicker from '../components/PersonPicker.vue'
import { useOrg, currentOrg } from '../app/useOrg.js'
import { useCatalog, ensureCatalog, orgCall, cachedRulesets } from '../app/useCatalog.js'
import { runQuery } from '../lib/query.js'
import { recordUrl } from '../lib/links.js'
import { inSpace } from '../lib/dataSpace.js'
import { parseRulesets, FUZZY_THRESHOLD } from '../lib/profile.js'
import { loadRulesetDetail, compareMany, MAX_COMPARE, describeCriterion, describeReconciliation, IDENTITY_SQL } from '../lib/identity.js'

const route = useRoute()
const router = useRouter()
const org = useOrg()
const catalog = useCatalog()
const rulesets = ref([])
const loading = ref(false)
const error = ref('')
const detail = ref(null)
const detailLoading = ref(false)
// People to compare (feedback #111): 2 to MAX_COMPARE slots, each a picked source record or null.
let slotSeq = 0
const newSlot = () => ({ key: ++slotSeq, person: null })
const slots = ref([newSlot(), newSlot()])
const pickedIds = computed(() => [...new Set(slots.value.map((x) => x.person?.id).filter(Boolean))])
const comparison = ref(null)
const comparing = ref(false)
const compareError = ref('')

const q = async (sql) => runQuery(orgCall(), org.version, sql, { rowLimit: 2000 })

async function load({ refresh = false } = {}) {
  if (!org.version) return
  loading.value = true
  error.value = ''
  try {
    rulesets.value = await cachedRulesets(async () => {
      const res = await orgCall()(`/services/data/v${org.version}/ssot/identity-resolutions`)
      if (!res.ok) throw new Error(res.error || `HTTP ${res.status}`)
      return parseRulesets(inSpace(res.data?.identityResolutions, org.dataSpace))
    }, { refresh })
    if (!route.params.id && rulesets.value[0]) router.replace(`/identity/${rulesets.value[0].id}`)
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}
onMounted(() => { ensureCatalog(); load() })
watch(() => [org.orgId, org.version, org.dataSpace], () => load())

const ruleset = computed(() => rulesets.value.find((r) => r.id === route.params.id) || null)

watch(ruleset, async (rs) => {
  detail.value = null
  comparison.value = null
  if (!rs) return
  detailLoading.value = true
  const d = await loadRulesetDetail(orgCall(), q, org.version, rs)
  if (ruleset.value?.id === rs.id) detail.value = d
  detailLoading.value = false
}, { immediate: true })

async function compare() {
  if (pickedIds.value.length < 2 || !ruleset.value) return
  comparing.value = true
  compareError.value = ''
  comparison.value = null
  try {
    await ensureCatalog()
    comparison.value = await compareMany(q, ruleset.value, catalog.objects, pickedIds.value)
  } catch (err) {
    compareError.value = err.message
  } finally {
    comparing.value = false
  }
}
const groupText = (groups, people) => groups.map((g) => g.map((k) => name(people[k])).join(' + ')).join('; ')

const maxSize = computed(() => Math.max(1, ...(detail.value?.sizes || []).map((s) => s.profiles)))
const num = (n) => (n == null ? '—' : Number(n).toLocaleString())
const when = (iso) => (iso ? new Date(iso).toLocaleString() : 'never')
const name = (p) => [p?.ssot__FirstName__c, p?.ssot__LastName__c].filter(Boolean).join(' ') || p?.ssot__PersonName__c || p?.ssot__Id__c
const card = 'border rounded-md bg-card'
const btn = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-sm hover:bg-accent disabled:opacity-50'
const sourceCols = [
  { key: 'source', label: 'Data source' },
  { key: 'object', label: 'Object' },
  { key: 'n', label: 'Source records', align: 'right', kind: 'number' },
]
</script>

<template>
  <section class="flex gap-4 min-h-0">
    <ListPanel name="identity" label="rulesets list" :width="288">
      <div class="flex items-center gap-2">
        <h2 class="font-semibold">Identity resolution <HelpTip topic="identity" /></h2>
        <button class="ml-auto p-1.5 rounded-md border hover:bg-accent" title="Load the rulesets again" @click="load({ refresh: true })"><RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" /></button>
      </div>
      <p v-if="error" class="text-xs text-destructive">{{ error }}</p>
      <p v-else-if="!loading && !rulesets.length" class="text-sm text-muted-foreground">No identity resolution rulesets in this data space.</p>
      <ul class="text-sm">
        <li v-for="r in rulesets" :key="r.id">
          <RouterLink :to="`/identity/${r.id}`" :class="['block px-2 py-1.5 rounded-md hover:bg-accent', { 'bg-accent': r.id === ruleset?.id }]">
            <div class="truncate">{{ r.label }}</div>
            <div class="text-xs text-muted-foreground">{{ r.id }} · {{ r.status.toLowerCase() }} · last run {{ r.lastJobStatus.toLowerCase() || 'never' }}</div>
          </RouterLink>
        </li>
      </ul>
    </ListPanel>

    <div class="flex-1 min-w-0 space-y-4">
      <p v-if="!ruleset" class="text-sm text-muted-foreground p-4">{{ loading ? 'Loading rulesets…' : 'Pick a ruleset.' }}</p>
      <template v-else>
        <div class="flex flex-wrap items-start gap-3">
          <div>
            <h2 class="text-lg font-semibold">{{ ruleset.label }}</h2>
            <div class="text-sm text-muted-foreground">{{ ruleset.description }}</div>
            <div class="text-xs text-muted-foreground mt-1">
              {{ [ruleset.id, ruleset.status.toLowerCase(), ruleset.runsAutomatically ? 'runs automatically' : 'runs by hand', ruleset.caseSensitive ? 'case-sensitive' : ''].filter(Boolean).join(' · ') }}
            </div>
          </div>
          <div class="ml-auto flex gap-2">
            <a v-if="ruleset.recordId" :class="btn" :href="recordUrl(currentOrg()?.host, ruleset.recordId)" target="_blank" rel="noopener">Open in Salesforce</a>
          </div>
        </div>

        <!-- Stats -->
        <div :class="[card, 'p-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm']">
          <div><div class="text-muted-foreground">Source profiles</div><div class="text-lg">{{ num(detail?.stats.sourceProfiles) }}</div></div>
          <div><div class="text-muted-foreground">Unified profiles</div><div class="text-lg">{{ num(detail?.stats.unifiedProfiles) }}</div></div>
          <div><div class="text-muted-foreground">Consolidation rate</div><div class="text-lg">{{ detail?.stats.consolidationRate == null ? '—' : `${Math.round(detail.stats.consolidationRate * 10) / 10}%` }}</div></div>
          <div><div class="text-muted-foreground">Last run</div><div>{{ (detail?.stats.lastJobStatus || '').toLowerCase() }}</div><div class="text-xs text-muted-foreground">{{ when(detail?.stats.lastJobCompleted) }}</div></div>
          <div v-if="detail?.stats.matchedSourceProfiles != null"><div class="text-muted-foreground">Matched source profiles</div><div>{{ num(detail.stats.matchedSourceProfiles) }}</div></div>
          <div v-if="detail?.stats.anonymousUnifiedProfiles != null"><div class="text-muted-foreground">Anonymous unified</div><div>{{ num(detail.stats.anonymousUnifiedProfiles) }}</div></div>
          <div v-if="detail?.stats.knownUnifiedProfiles != null"><div class="text-muted-foreground">Known unified</div><div>{{ num(detail.stats.knownUnifiedProfiles) }}</div></div>
        </div>

        <!-- Rules -->
        <div class="grid lg:grid-cols-2 gap-4">
          <div :class="card">
            <h3 class="p-3 border-b font-medium">Match rules ({{ ruleset.rules.length }})</h3>
            <p class="px-3 pt-2 text-xs text-muted-foreground">Two records join when every criterion of any one rule holds.</p>
            <div v-for="(r, i) in ruleset.rules" :key="i" class="p-3 text-sm border-b last:border-0">
              <div class="font-medium">{{ r.label || `Rule ${i + 1}` }}</div>
              <ul class="list-disc pl-5 mt-1 space-y-0.5"><li v-for="c in r.criteria" :key="c.entity + c.field">{{ describeCriterion(c) }}</li></ul>
            </div>
          </div>
          <div :class="card">
            <h3 class="p-3 border-b font-medium">Reconciliation rules</h3>
            <p class="px-3 pt-2 text-xs text-muted-foreground">Which value the unified profile keeps when the source records differ.</p>
            <div v-for="rec in ruleset.reconciliation" :key="rec.entity" class="p-3 text-sm border-b last:border-0">
              <div v-for="(l, i) in describeReconciliation(rec)" :key="i" :class="i ? 'text-xs text-muted-foreground pl-3' : ''">{{ l }}</div>
            </div>
          </div>
        </div>

        <!-- Profile sizes and largest -->
        <div class="grid lg:grid-cols-2 gap-4">
          <div :class="card">
            <h3 class="p-3 border-b font-medium">Source records per unified profile</h3>
            <p v-if="detailLoading" class="p-3 text-sm text-muted-foreground">Counting…</p>
            <p v-else-if="detail?.errors.sizes" class="p-3 text-sm text-destructive">{{ detail.errors.sizes }}</p>
            <p v-else-if="!detail?.sizes.length" class="p-3 text-sm text-muted-foreground">No unified profiles yet.</p>
            <table v-else class="w-full text-sm">
              <tbody>
                <tr v-for="s in detail.sizes" :key="s.sources" class="border-b last:border-0">
                  <td class="p-2 w-28">{{ s.sources }} {{ s.sources === 1 ? 'record' : 'records' }}</td>
                  <td class="p-2"><div class="h-2 rounded bg-foreground/60" :style="{ width: `${Math.max(2, (s.profiles / maxSize) * 100)}%` }" /></td>
                  <td class="p-2 text-right w-24">{{ num(s.profiles) }}</td>
                </tr>
              </tbody>
            </table>
            <p v-if="detail?.sizes.length" class="px-3 pb-3 text-xs text-muted-foreground"><button class="text-link hover:underline" @click="router.push({ path: '/sql', query: { sql: IDENTITY_SQL.sizes(ruleset.link) } })">Open in SQL</button></p>
          </div>
          <div :class="card">
            <h3 class="p-3 border-b font-medium">Largest unified profiles</h3>
            <p class="px-3 pt-2 text-xs text-muted-foreground">Unusually large profiles are where wrong merges usually hide (a shared email or phone, test data).</p>
            <p v-if="detail && !detail.largest.length" class="p-3 text-sm text-muted-foreground">No profile has more than one source record.</p>
            <ul v-else class="p-3 text-sm space-y-0.5">
              <li v-for="l in detail?.largest || []" :key="l.unified" class="flex gap-2">
                <RouterLink :to="{ path: `/profile/u/${l.unified}`, query: { rs: ruleset.id } }" class="font-mono text-xs text-link hover:underline truncate">{{ l.unified }}</RouterLink>
                <span class="ml-auto">{{ num(l.sources) }} records</span>
              </li>
            </ul>
          </div>
        </div>

        <div :class="card">
          <h3 class="p-3 border-b font-medium">Where the source records come from</h3>
          <DataTable :columns="sourceCols" :rows="detail?.sources || []" :row-key="(s) => s.source + s.object" :bordered="false" :empty="detailLoading ? 'Counting…' : 'None.'">
            <template #cell-n="{ value }">{{ num(value) }}</template>
          </DataTable>
        </div>

        <!-- Compare people -->
        <div :class="card">
          <h3 class="p-3 border-b font-medium" data-help="identity-compare">Compare people <HelpTip topic="identity-compare" /></h3>
          <div class="p-3 space-y-3">
            <p class="text-sm text-muted-foreground">Pick two or more source records (up to {{ MAX_COMPARE }}) to see, criterion by criterion, which of them this ruleset would join, and how that compares with the unified profiles they are in now.</p>
            <div class="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              <div v-for="(slot, k) in slots" :key="slot.key" class="relative">
                <PersonPicker :q="q" :ruleset="ruleset" :label="`Person ${k + 1}`" @pick="(p) => { slot.person = p; comparison = null }" />
                <button v-if="slots.length > 2" class="absolute right-0 top-0 p-0.5 rounded hover:bg-accent text-muted-foreground" :aria-label="`Remove person ${k + 1}`" @click="slots.splice(k, 1); comparison = null"><X class="w-3.5 h-3.5" /></button>
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <button class="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50" :disabled="pickedIds.length < 2 || comparing" @click="compare">{{ comparing ? 'Comparing…' : `Compare ${pickedIds.length || ''} ${pickedIds.length === 1 ? 'person' : 'people'}` }}</button>
              <button v-if="slots.length < MAX_COMPARE" class="text-sm text-link hover:underline" @click="slots.push(newSlot())">Add a person</button>
            </div>
            <p v-if="compareError" class="text-sm text-destructive">{{ compareError }}</p>
            <template v-if="comparison">
              <div class="text-sm space-y-1">
                <p><strong>The rules would group them as:</strong> {{ groupText(comparison.ruleGroups, comparison.people) }}</p>
                <p v-if="comparison.profileGroups"><strong>In unified profiles now:</strong> {{ groupText(comparison.profileGroups, comparison.people) }}</p>
                <p v-if="comparison.agrees === true" class="text-muted-foreground">The two agree.</p>
                <p v-else-if="comparison.agrees === false" class="text-amber-700 dark:text-amber-400">They differ: records may be joined at the next run, a fuzzy match may be weaker than this check assumes, or another rule (or a chain through records not shown) joined them.</p>
              </div>
              <div class="overflow-auto">
                <table class="text-xs border-collapse">
                  <thead><tr class="text-muted-foreground"><th class="px-2 py-1 text-left font-normal">Pair</th><th class="px-2 py-1 text-left font-normal">Rules that join them</th><th class="px-2 py-1 text-left font-normal">Same unified profile</th></tr></thead>
                  <tbody>
                    <tr v-for="p in comparison.pairs" :key="`${p.a}-${p.b}`" class="border-t">
                      <td class="px-2 py-1">{{ name(comparison.people[p.a]) }} and {{ name(comparison.people[p.b]) }}</td>
                      <td class="px-2 py-1" :class="p.rules.length ? 'font-medium' : 'text-muted-foreground'">{{ p.rules.join(', ') || 'none' }}</td>
                      <td class="px-2 py-1">{{ p.sameProfile == null ? 'unknown' : p.sameProfile ? 'yes' : 'no' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div v-for="(r, i) in comparison.rules" :key="i" class="overflow-auto">
                <div class="text-sm font-medium mb-1">{{ r.label || `Rule ${i + 1}` }}</div>
                <table class="text-xs border-collapse">
                  <thead><tr class="text-muted-foreground"><th class="px-2 py-1 text-left font-normal">Criterion</th><th v-for="(pp, k) in comparison.people" :key="k" class="px-2 py-1 text-left font-normal">{{ name(pp) }}</th></tr></thead>
                  <tbody>
                    <tr v-for="row in r.rows" :key="row.text" class="border-t">
                      <td class="px-2 py-1">{{ row.text }}</td>
                      <td v-for="(v, k) in row.values" :key="k" class="px-2 py-1 font-mono" :class="row.matchesSomeone[k] ? '' : 'text-muted-foreground'" :title="row.matchesSomeone[k] ? 'Matches at least one other person' : 'Matches nobody else here'">{{ v.join(', ') || 'blank' }}<Check v-if="row.matchesSomeone[k]" class="inline w-3 h-3 ml-1 text-green-700 dark:text-green-400" /></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p class="text-xs text-muted-foreground">A tick means the value matches at least one other person for that criterion. Exact and normalized checks follow the rule settings; fuzzy is approximated (Jaro-Winkler at {{ FUZZY_THRESHOLD }}).</p>
            </template>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>
