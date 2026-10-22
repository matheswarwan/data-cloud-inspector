<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { RefreshCw } from 'lucide-vue-next'
import { useOrg, currentOrg } from '../app/useOrg.js'
import { orgCall } from '../app/useCatalog.js'
import { runQuery } from '../lib/query.js'
import { recordUrl } from '../lib/links.js'
import { loadSetup, loadActivity, pointTree, experimentTree, nameOf, ACTIVITY_SQL } from '../lib/personalization.js'

const router = useRouter()
const org = useOrg()
const setup = ref(null)
const activity = ref(null)
const loading = ref(false)
const days = ref(30)
const tab = ref('setup')

const q = async (sql) => runQuery(orgCall(), org.version, sql, { rowLimit: 2000 })

async function load() {
  if (!org.version) return
  loading.value = true
  const orgId = org.orgId
  const [s, a] = await Promise.all([loadSetup(orgCall(), org.version), loadActivity(q, { days: days.value })])
  if (org.orgId !== orgId) return
  setup.value = s
  activity.value = a
  loading.value = false
}
onMounted(load)
watch(() => [org.orgId, org.version, org.dataSpace], load)
watch(days, async () => { activity.value = await loadActivity(q, { days: days.value }) })

const points = computed(() => (setup.value ? pointTree(setup.value) : []))
const experiments = computed(() => (setup.value ? experimentTree(setup.value) : []))
const totals = computed(() => {
  const d = activity.value?.daily || []
  return { requests: d.reduce((n, r) => n + Number(r.requests || 0), 0), days: d.length }
})
const maxDaily = computed(() => Math.max(1, ...(activity.value?.daily || []).map((r) => Number(r.requests || 0))))
const errors = (k) => setup.value?.errors?.[k]
const sf = (id) => recordUrl(currentOrg()?.host, id)
const when = (iso) => (iso ? new Date(iso).toLocaleString() : '')
const num = (n) => (n == null || n === '' ? '' : Number(n).toLocaleString())
const card = 'border rounded-md bg-card'
const tabBtn = (t) => ['px-3 py-1.5 text-sm border-b-2', tab.value === t ? 'border-primary font-medium' : 'border-transparent text-muted-foreground hover:text-foreground']
const btn = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-sm hover:bg-accent disabled:opacity-50'
</script>

<template>
  <section class="max-w-6xl mx-auto space-y-4">
    <div class="flex flex-wrap items-center gap-3">
      <div>
        <h2 class="text-lg font-semibold">Personalization</h2>
        <p class="text-sm text-muted-foreground">Salesforce Personalization setup (points, decisions, recommenders, experiments) and what the personalization log recorded.</p>
      </div>
      <button :class="[btn, 'ml-auto']" :disabled="loading" @click="load"><RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" /> Load again</button>
    </div>
    <p v-if="loading && !setup" class="text-sm text-muted-foreground">Reading the setup and the log…</p>

    <template v-if="setup">
      <nav class="flex border-b">
        <button :class="tabBtn('setup')" @click="tab = 'setup'">Points and decisions ({{ points.length }})</button>
        <button :class="tabBtn('recommenders')" @click="tab = 'recommenders'">Recommenders ({{ setup.recommenders.length }})</button>
        <button :class="tabBtn('experiments')" @click="tab = 'experiments'">Experiments ({{ experiments.length }})</button>
        <button :class="tabBtn('schemas')" @click="tab = 'schemas'">Schemas and objectives ({{ setup.schemas.length + setup.objectives.length }})</button>
        <button :class="tabBtn('activity')" @click="tab = 'activity'">Activity</button>
      </nav>

      <!-- Points and decisions -->
      <div v-if="tab === 'setup'" class="space-y-3">
        <p v-if="errors('points')" class="text-sm text-destructive">{{ errors('points') }}</p>
        <p v-else-if="!points.length" class="text-sm text-muted-foreground">No personalization points in this org.</p>
        <div v-for="p in points" :key="p.Id" :class="card">
          <div class="p-3 border-b flex flex-wrap items-baseline gap-2">
            <a :href="sf(p.Id)" target="_blank" rel="noopener" class="font-medium text-link hover:underline">{{ p.Name }}</a>
            <span class="font-mono text-xs text-muted-foreground">{{ p.DeveloperName }}</span>
            <span class="ml-auto text-sm">{{ p.Status }}</span>
          </div>
          <div class="p-3 text-sm space-y-2">
            <div class="text-muted-foreground">
              {{ [p.schemaName && `schema ${p.schemaName}`, p.Source && `source ${p.Source}`, p.MaxItemsCount && `up to ${p.MaxItemsCount} items`, p.IsAuthenticationRequired && 'known people only', p.experimentName && `experiment ${p.experimentName}`].filter(Boolean).join(' · ') }}
            </div>
            <p v-if="!p.decisions.length" class="text-muted-foreground">No decisions.</p>
            <table v-else class="w-full text-sm">
              <thead class="text-left text-muted-foreground"><tr><th class="py-1 font-normal">Priority</th><th class="py-1 font-normal">Decision</th><th class="py-1 font-normal">State</th><th class="py-1 font-normal">Recommender</th><th class="py-1 font-normal">Experiment</th></tr></thead>
              <tbody>
                <tr v-for="d in p.decisions" :key="d.Id" class="border-t">
                  <td class="py-1">{{ d.Priority }}</td>
                  <td class="py-1"><a :href="sf(d.Id)" target="_blank" rel="noopener" class="text-link hover:underline">{{ d.Name }}</a></td>
                  <td class="py-1">{{ d.State }}</td>
                  <td class="py-1">{{ d.personalizerName }}</td>
                  <td class="py-1">{{ d.experimentName }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Recommenders -->
      <div v-else-if="tab === 'recommenders'">
        <p v-if="errors('recommenders')" class="text-sm text-destructive">{{ errors('recommenders') }}</p>
        <p v-else-if="!setup.recommenders.length" class="text-sm text-muted-foreground">No recommenders in this org.</p>
        <table v-else :class="[card, 'w-full text-sm']">
          <thead class="text-left text-muted-foreground border-b"><tr><th class="p-2 font-normal">Recommender</th><th class="p-2 font-normal">Status</th><th class="p-2 font-normal">Last refresh</th><th class="p-2 font-normal">Last success</th><th class="p-2 font-normal">Goal</th><th class="p-2 font-normal">Every</th></tr></thead>
          <tbody>
            <tr v-for="r in setup.recommenders" :key="r.Id" class="border-b last:border-0">
              <td class="p-2"><a :href="sf(r.Id)" target="_blank" rel="noopener" class="text-link hover:underline">{{ r.Name }}</a><div class="text-xs text-muted-foreground">{{ r.Description }}</div></td>
              <td class="p-2">{{ [r.Status, r.State].filter(Boolean).join(', ') }}</td>
              <td class="p-2">{{ when(r.LastRefresh) }}<div class="text-xs" :class="/fail|error/i.test(r.LatestRefreshedStatus || '') ? 'text-destructive' : 'text-muted-foreground'">{{ r.LatestRefreshedStatus }}</div></td>
              <td class="p-2">{{ when(r.LastSuccessfulRefresh) }}</td>
              <td class="p-2">{{ r.Goal }}</td>
              <td class="p-2">{{ r.ScheduleFrequencyInMinutes ? `${r.ScheduleFrequencyInMinutes} min` : '' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Experiments -->
      <div v-else-if="tab === 'experiments'" class="space-y-3">
        <p v-if="errors('experiments')" class="text-sm text-destructive">{{ errors('experiments') }}</p>
        <p v-else-if="!experiments.length" class="text-sm text-muted-foreground">No experiments in this org.</p>
        <div v-for="e in experiments" :key="e.Id" :class="[card, 'p-3 text-sm space-y-1']">
          <div class="flex flex-wrap items-baseline gap-2">
            <a :href="sf(e.Id)" target="_blank" rel="noopener" class="font-medium text-link hover:underline">{{ e.Name }}</a>
            <span class="ml-auto">{{ [e.Status, e.State].filter(Boolean).join(', ') }}</span>
          </div>
          <div class="text-muted-foreground">
            {{ [e.StartedDate && `started ${when(e.StartedDate)}`, e.StoppedDate && `stopped ${when(e.StoppedDate)}`, e.WinnerSelectionMode && `winner ${e.WinnerSelectionMode.toLowerCase()}`, e.WinnerSelectionOutcome && `outcome ${e.WinnerSelectionOutcome}`, e.LastAnalyzed && `analysed ${when(e.LastAnalyzed)}`].filter(Boolean).join(' · ') }}
          </div>
          <ul v-if="e.decisions.length" class="list-disc pl-5">
            <li v-for="d in e.decisions" :key="d.PersonalizationDecisionId">{{ d.decisionName }} <span class="text-muted-foreground">{{ [d.ExperimentStatus, d.ExperimentState].filter(Boolean).join(', ') }}</span></li>
          </ul>
        </div>
      </div>

      <!-- Schemas and objectives -->
      <div v-else-if="tab === 'schemas'" class="space-y-3">
        <table v-if="setup.schemas.length" :class="[card, 'w-full text-sm']">
          <thead class="text-left text-muted-foreground border-b"><tr><th class="p-2 font-normal">Content schema</th><th class="p-2 font-normal">Type</th><th class="p-2 font-normal">Description</th></tr></thead>
          <tbody>
            <tr v-for="s in setup.schemas" :key="s.Id" class="border-b last:border-0">
              <td class="p-2"><a :href="sf(s.Id)" target="_blank" rel="noopener" class="text-link hover:underline">{{ s.Name }}</a><div class="font-mono text-xs text-muted-foreground">{{ s.DeveloperName }}</div></td>
              <td class="p-2">{{ s.PersonalizationType }}</td>
              <td class="p-2 text-muted-foreground">{{ s.Description }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="text-sm text-muted-foreground">No content schemas.</p>
        <table v-if="setup.objectives.length" :class="[card, 'w-full text-sm']">
          <thead class="text-left text-muted-foreground border-b"><tr><th class="p-2 font-normal">Objective</th><th class="p-2 font-normal">Description</th></tr></thead>
          <tbody><tr v-for="o in setup.objectives" :key="o.Id" class="border-b last:border-0"><td class="p-2">{{ o.Name }}</td><td class="p-2 text-muted-foreground">{{ o.Description }}</td></tr></tbody>
        </table>
        <p v-else class="text-sm text-muted-foreground">No objectives.</p>
      </div>

      <!-- Activity -->
      <div v-else-if="tab === 'activity'" class="space-y-4">
        <div class="flex items-center gap-2 text-sm">
          <label for="days" class="text-muted-foreground">Period</label>
          <select id="days" v-model.number="days" class="border rounded-md px-2 py-1 bg-background">
            <option :value="7">Last 7 days</option><option :value="30">Last 30 days</option><option :value="90">Last 90 days</option>
          </select>
          <span class="text-muted-foreground">{{ num(totals.requests) }} requests</span>
          <button class="ml-auto text-xs text-link hover:underline" @click="router.push({ path: '/sql', query: { sql: ACTIVITY_SQL.recent() } })">Open the log in SQL</button>
        </div>
        <p v-for="(e, k) in activity?.errors" :key="k" class="text-sm text-destructive">{{ k }}: {{ e }}</p>
        <p v-if="activity && !totals.requests && !activity.recent.length" class="text-sm text-muted-foreground">
          The personalization log has no requests in this period. Requests appear here once a site or app calls Salesforce Personalization.
        </p>
        <template v-else-if="activity">
          <div :class="[card, 'p-3']">
            <div class="text-sm font-medium mb-2">Requests per day</div>
            <div class="flex items-end gap-0.5 h-32">
              <div v-for="d in activity.daily" :key="d.day" class="flex-1 bg-foreground/70 min-w-0.5" :style="{ height: `${(Number(d.requests) / maxDaily) * 100}%` }" :title="`${d.day}: ${num(d.requests)} requests, ${num(d.people)} people, ${Math.round(d.avg_ms || 0)} ms on average`" />
            </div>
          </div>
          <div class="grid md:grid-cols-[2fr_1fr] gap-4">
            <table :class="[card, 'w-full text-sm']">
              <thead class="text-left text-muted-foreground border-b"><tr><th class="p-2 font-normal">Point</th><th class="p-2 font-normal">Decision</th><th class="p-2 font-normal">Recommender</th><th class="p-2 font-normal text-right">Requests</th><th class="p-2 font-normal text-right">People</th></tr></thead>
              <tbody>
                <tr v-for="(r, i) in activity.byDecision" :key="i" class="border-b last:border-0">
                  <td class="p-2">{{ nameOf(setup, r.point) }}</td><td class="p-2">{{ nameOf(setup, r.decision) }}</td><td class="p-2">{{ nameOf(setup, r.personalizer) }}</td>
                  <td class="p-2 text-right">{{ num(r.requests) }}</td><td class="p-2 text-right">{{ num(r.people) }}</td>
                </tr>
              </tbody>
            </table>
            <table :class="[card, 'w-full text-sm']">
              <thead class="text-left text-muted-foreground border-b"><tr><th class="p-2 font-normal">Status code</th><th class="p-2 font-normal text-right">Requests</th></tr></thead>
              <tbody><tr v-for="r in activity.byStatus" :key="r.status" class="border-b last:border-0"><td class="p-2">{{ r.status || 'none' }}</td><td class="p-2 text-right">{{ num(r.n) }}</td></tr></tbody>
            </table>
          </div>
          <div :class="card">
            <h3 class="p-3 border-b font-medium">Latest requests</h3>
            <table class="w-full text-sm">
              <tbody>
                <tr v-for="(r, i) in activity.recent" :key="i" class="border-b last:border-0">
                  <td class="p-2 whitespace-nowrap">{{ when(r.at) }}</td>
                  <td class="p-2">{{ nameOf(setup, r.point) }}<div class="text-xs text-muted-foreground">{{ nameOf(setup, r.decision) }}</div></td>
                  <td class="p-2"><RouterLink v-if="r.individual" :to="`/profile/s/${r.individual}`" class="text-link hover:underline font-mono text-xs">{{ r.individual }}</RouterLink></td>
                  <td class="p-2 text-xs">{{ [r.channel, r.content, r.items != null ? `${r.items} items` : ''].filter(Boolean).join(' · ') }}</td>
                  <td class="p-2 text-right whitespace-nowrap">{{ r.status }} · {{ Math.round(r.ms || 0) }} ms</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </div>
    </template>
  </section>
</template>
