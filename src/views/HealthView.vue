<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { RefreshCw } from 'lucide-vue-next'
import { useOrg, currentOrg } from '../app/useOrg.js'
import { orgCall } from '../app/useCatalog.js'
import { recordUrl } from '../lib/links.js'
import { loadHealth, countLevels, healthMarkdown, LEVELS, LEVEL_TEXT } from '../lib/health.js'
import { latestProblemsSql } from '../lib/problems.js'
import { useRouter } from 'vue-router'

const org = useOrg()
const router = useRouter()
const sections = ref([])
const loading = ref(false)
const checkedAt = ref(null)
const problemsOnly = ref(false)
const notice = ref('')

async function load() {
  if (!org.version) return
  loading.value = true
  notice.value = ''
  const orgId = org.orgId
  const result = await loadHealth(orgCall(), org.version)
  if (org.orgId !== orgId) return
  sections.value = result
  checkedAt.value = new Date()
  loading.value = false
}
onMounted(load)
watch(() => [org.orgId, org.version, org.dataSpace], load)

const all = computed(() => sections.value.flatMap((s) => s.items))
const totals = computed(() => countLevels(all.value))
const shown = (items) => (problemsOnly.value ? items.filter((i) => i.level === 'fail' || i.level === 'warn') : items)

// Where a row opens: our own page when there is one, else the record in Salesforce.
function inside(i) {
  if (i.kind === 'Data stream' && i.dlo) return `/objects/${i.dlo}`
  if (i.kind === 'Calculated insight') return `/objects/${i.name}`
  if (i.kind === 'Segment') return `/segments/${i.name}`
  return null
}

async function copyMarkdown() {
  await navigator.clipboard.writeText(healthMarkdown(sections.value, { host: currentOrg()?.host, at: checkedAt.value || new Date() }))
  notice.value = 'Copied the health report as Markdown.'
}

function ago(iso) {
  if (!iso) return 'never'
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000)
  if (Number.isNaN(mins)) return iso
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  if (mins < 48 * 60) return `${Math.round(mins / 60)} h ago`
  return `${Math.round(mins / 1440)} days ago`
}

const DOT = { fail: 'bg-red-500', warn: 'bg-amber-400', running: 'bg-sky-500', idle: 'bg-gray-400', ok: 'bg-green-500' }
const card = 'border rounded-md bg-card'
const btn = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-sm hover:bg-accent disabled:opacity-50'
</script>

<template>
  <section class="max-w-6xl mx-auto space-y-4">
    <div class="flex flex-wrap items-center gap-3">
      <div>
        <h2 class="text-lg font-semibold">Health</h2>
        <p class="text-sm text-muted-foreground">
          Data streams, identity resolution, calculated insights, segments and activations, problems first.
          <span v-if="checkedAt"> Checked {{ checkedAt.toLocaleTimeString() }}.</span>
        </p>
      </div>
      <div class="ml-auto flex items-center gap-2">
        <label class="text-sm flex items-center gap-1.5"><input v-model="problemsOnly" type="checkbox" /> Problems only</label>
        <button :class="btn" :disabled="loading || !sections.length" @click="copyMarkdown">Copy as Markdown</button>
        <button :class="btn" :disabled="loading" @click="load"><RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" /> Check again</button>
      </div>
    </div>
    <p v-if="notice" class="text-sm text-muted-foreground">{{ notice }}</p>
    <p v-if="loading && !sections.length" class="text-sm text-muted-foreground">Checking the org…</p>

    <table v-if="sections.length" :class="[card, 'w-full text-sm']">
      <thead class="text-left text-muted-foreground border-b">
        <tr>
          <th class="p-2 font-normal">Area</th>
          <th v-for="l in LEVELS" :key="l" class="p-2 font-normal text-right">{{ LEVEL_TEXT[l] }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="s in sections" :key="s.title" class="border-b last:border-0">
          <td class="p-2">{{ s.title }}<span v-if="s.error" class="text-destructive text-xs ml-2">could not load</span></td>
          <td v-for="l in LEVELS" :key="l" class="p-2 text-right" :class="{ 'font-semibold': (l === 'fail' || l === 'warn') && countLevels(s.items)[l] }">
            {{ countLevels(s.items)[l] || '' }}
          </td>
        </tr>
        <tr class="text-muted-foreground">
          <td class="p-2">All</td>
          <td v-for="l in LEVELS" :key="l" class="p-2 text-right">{{ totals[l] || '' }}</td>
        </tr>
      </tbody>
    </table>

    <div v-for="s in sections" :key="s.title" :class="card">
      <h3 class="p-3 border-b font-medium">{{ s.title }} <span class="text-muted-foreground font-normal text-sm">({{ s.items.length }})</span></h3>
      <p v-if="s.error" class="p-3 text-sm text-destructive">Could not load: {{ s.error }}</p>
      <p v-else-if="!s.items.length" class="p-3 text-sm text-muted-foreground">None in this org.</p>
      <p v-else-if="!shown(s.items).length" class="p-3 text-sm text-muted-foreground">No problems.</p>
      <table v-else class="w-full text-sm">
        <tbody>
          <tr v-for="i in shown(s.items)" :key="i.name" class="border-b last:border-0 align-top">
            <td class="p-2 w-32 whitespace-nowrap"><span :class="['inline-block w-2 h-2 rounded-full mr-2', DOT[i.level]]" />{{ LEVEL_TEXT[i.level] }}</td>
            <td class="p-2">
              <RouterLink v-if="inside(i)" :to="inside(i)" class="text-link hover:underline">{{ i.label }}</RouterLink>
              <span v-else>{{ i.label }}</span>
              <a v-if="i.recordId" :href="recordUrl(currentOrg()?.host, i.recordId)" target="_blank" rel="noopener" class="ml-2 text-xs text-link hover:underline">Open in Salesforce</a>
              <div class="text-xs text-muted-foreground">{{ i.details }}</div>
              <button v-if="i.problems?.count" class="text-xs text-link hover:underline" @click="router.push({ path: '/sql', query: { sql: latestProblemsSql(i.problemDlo) } })">See the problem records in SQL</button>
            </td>
            <td class="p-2">{{ i.reason }}</td>
            <td class="p-2 w-32 whitespace-nowrap text-right" :title="i.lastRun ? new Date(i.lastRun).toLocaleString() : ''">{{ ago(i.lastRun) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
