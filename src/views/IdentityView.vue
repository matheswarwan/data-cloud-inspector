<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { RefreshCw } from 'lucide-vue-next'
import PersonPicker from '../components/PersonPicker.vue'
import { useOrg, currentOrg } from '../app/useOrg.js'
import { useCatalog, ensureCatalog, orgCall, cachedRulesets } from '../app/useCatalog.js'
import { runQuery } from '../lib/query.js'
import { recordUrl } from '../lib/links.js'
import { inSpace } from '../lib/dataSpace.js'
import { parseRulesets, FUZZY_THRESHOLD } from '../lib/profile.js'
import { loadRulesetDetail, comparePeople, describeCriterion, describeReconciliation, IDENTITY_SQL } from '../lib/identity.js'

const route = useRoute()
const router = useRouter()
const org = useOrg()
const catalog = useCatalog()
const rulesets = ref([])
const loading = ref(false)
const error = ref('')
const detail = ref(null)
const detailLoading = ref(false)
const personA = ref(null)
const personB = ref(null)
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
  if (!personA.value || !personB.value || !ruleset.value) return
  comparing.value = true
  compareError.value = ''
  comparison.value = null
  try {
    await ensureCatalog()
    comparison.value = await comparePeople(q, ruleset.value, catalog.objects, personA.value.id, personB.value.id)
  } catch (err) {
    compareError.value = err.message
  } finally {
    comparing.value = false
  }
}

const maxSize = computed(() => Math.max(1, ...(detail.value?.sizes || []).map((s) => s.profiles)))
const num = (n) => (n == null ? '—' : Number(n).toLocaleString())
const when = (iso) => (iso ? new Date(iso).toLocaleString() : 'never')
const name = (p) => [p?.ssot__FirstName__c, p?.ssot__LastName__c].filter(Boolean).join(' ') || p?.ssot__PersonName__c || p?.ssot__Id__c
const card = 'border rounded-md bg-card'
const btn = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-sm hover:bg-accent disabled:opacity-50'
</script>

<template>
  <section class="flex gap-4 min-h-0">
    <aside class="w-72 shrink-0 space-y-2">
      <div class="flex items-center gap-2">
        <h2 class="font-semibold">Identity resolution</h2>
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
    </aside>

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
          <table class="w-full text-sm">
            <tbody>
              <tr v-for="s in detail?.sources || []" :key="s.source + s.object" class="border-b last:border-0">
                <td class="p-2">{{ s.source }}</td><td class="p-2">{{ s.object }}</td><td class="p-2 text-right">{{ num(s.n) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Compare two people -->
        <div :class="card">
          <h3 class="p-3 border-b font-medium">Compare two people</h3>
          <div class="p-3 space-y-3">
            <p class="text-sm text-muted-foreground">Pick two source records to see, criterion by criterion, whether this ruleset would join them.</p>
            <div class="grid md:grid-cols-2 gap-4">
              <PersonPicker :q="q" :ruleset="ruleset" label="First person" @pick="(p) => { personA = p; comparison = null }" />
              <PersonPicker :q="q" :ruleset="ruleset" label="Second person" @pick="(p) => { personB = p; comparison = null }" />
            </div>
            <button class="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50" :disabled="!personA || !personB || comparing || personA?.id === personB?.id" @click="compare">{{ comparing ? 'Comparing…' : 'Compare' }}</button>
            <p v-if="compareError" class="text-sm text-destructive">{{ compareError }}</p>
            <template v-if="comparison">
              <p class="text-sm">
                <strong>{{ comparison.anyRuleMatches ? 'The rules match these two records.' : 'No rule matches these two records.' }}</strong>
                <template v-if="comparison.sameProfile">
                  {{ comparison.sameProfile.same ? ' They are in the same unified profile.' : ' They are in different unified profiles.' }}
                  <span v-if="comparison.anyRuleMatches && !comparison.sameProfile.same" class="text-muted-foreground">They may be joined at the next run, or a fuzzy match is weaker than this check assumes.</span>
                </template>
              </p>
              <div v-for="(r, i) in comparison.rules" :key="i" class="overflow-auto">
                <div class="text-sm font-medium mb-1">{{ r.label || `Rule ${i + 1}` }}: {{ r.matches ? 'matches' : 'does not match' }}</div>
                <table class="text-xs border-collapse">
                  <thead><tr class="text-muted-foreground"><th class="px-2 py-1 text-left font-normal">Criterion</th><th class="px-2 py-1 text-left font-normal">{{ name(comparison.a) }}</th><th class="px-2 py-1 text-left font-normal">{{ name(comparison.b) }}</th><th class="px-2 py-1 text-left font-normal">Result</th></tr></thead>
                  <tbody>
                    <tr v-for="row in r.rows" :key="row.text" class="border-t">
                      <td class="px-2 py-1">{{ row.text }}</td>
                      <td class="px-2 py-1 font-mono">{{ row.a.join(', ') || 'blank' }}</td>
                      <td class="px-2 py-1 font-mono">{{ row.b.join(', ') || 'blank' }}</td>
                      <td class="px-2 py-1" :class="row.matches ? '' : 'text-destructive'">{{ row.matches ? 'match' : 'no match' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p class="text-xs text-muted-foreground">Exact and normalized checks follow the rule settings; fuzzy is approximated (Jaro-Winkler at {{ FUZZY_THRESHOLD }}).</p>
            </template>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>
