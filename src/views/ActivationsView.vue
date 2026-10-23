<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { RefreshCw } from 'lucide-vue-next'
import { useOrg, currentOrg } from '../app/useOrg.js'
import { orgCall } from '../app/useCatalog.js'
import { runQuery } from '../lib/query.js'
import { recordUrl } from '../lib/links.js'
import { toObjects } from '../lib/profile.js'
import { loadActivations, loadActivation } from '../lib/activations.js'
import { activationHealth } from '../lib/health.js'
import { loadSegments } from '../lib/segments.js'

const route = useRoute()
const org = useOrg()
const list = ref([])
const loading = ref(false)
const error = ref('')
const act = ref(null)
const actError = ref('')
const counts = ref({})
const segments = ref([])

async function load() {
  if (!org.version) return
  loading.value = true
  error.value = ''
  try { list.value = await loadActivations(orgCall(), org.version) } catch (err) { error.value = err.message }
  segments.value = await loadSegments(orgCall(), org.version).catch(() => [])
  loading.value = false
}
onMounted(load)
watch(() => [org.orgId, org.version, org.dataSpace], load)

watch(() => [route.params.id, org.version], async ([id]) => {
  act.value = null
  actError.value = ''
  counts.value = {}
  if (!id || !org.version) return
  try {
    const a = await loadActivation(orgCall(), org.version, id)
    if (route.params.id !== id) return
    act.value = a
    for (const t of [a.latestAudience, a.historyAudience].filter(Boolean)) {
      runQuery(orgCall(), org.version, `SELECT COUNT(*) AS n FROM ${t}`, { rowLimit: 1 })
        .then((r) => { counts.value = { ...counts.value, [t]: Number(toObjects(r)[0]?.n ?? 0) } })
        .catch((err) => { counts.value = { ...counts.value, [t]: err.message } })
    }
  } catch (err) {
    actError.value = err.message
  }
}, { immediate: true })

// The activation names its segment by display name; find the segment by ID for the link.
const segmentApi = computed(() => segments.value.find((s) => act.value?.segmentId && s.id.slice(0, 15) === act.value.segmentId.slice(0, 15))?.apiName || '')
const DOT = { fail: 'bg-red-500', warn: 'bg-amber-400', running: 'bg-sky-500', idle: 'bg-gray-400', ok: 'bg-green-500' }
const when = (iso) => (iso ? new Date(iso).toLocaleString() : 'never')
const num = (n) => (typeof n === 'number' ? n.toLocaleString() : n || '…')
const btn = 'inline-flex items-center px-2.5 py-1.5 rounded-md border text-sm hover:bg-accent'
</script>

<template>
  <section class="flex gap-4 min-h-0">
    <aside class="w-80 shrink-0 space-y-2">
      <div class="flex items-center gap-2">
        <h2 class="font-semibold">Activations</h2>
        <button class="ml-auto p-1.5 rounded-md border hover:bg-accent" title="Load again" @click="load"><RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" /></button>
      </div>
      <p v-if="error" class="text-xs text-destructive">{{ error }}</p>
      <p v-else-if="!loading && !list.length" class="text-sm text-muted-foreground">No activations in this data space.</p>
      <ul class="text-sm">
        <li v-for="a in list" :key="a.id">
          <RouterLink :to="`/activations/${a.id}`" :class="['block px-2 py-1.5 rounded-md hover:bg-accent', { 'bg-accent': a.id === route.params.id }]">
            <div class="flex items-center gap-2"><span :class="['w-2 h-2 rounded-full shrink-0', DOT[activationHealth(a).level]]" /><span class="truncate">{{ a.name }}</span></div>
            <div class="text-xs text-muted-foreground truncate pl-4">{{ a.segment }} to {{ a.target }}</div>
          </RouterLink>
        </li>
      </ul>
    </aside>

    <div class="flex-1 min-w-0 space-y-4">
      <p v-if="!route.params.id" class="text-sm text-muted-foreground p-4">{{ loading ? 'Loading activations…' : 'Pick an activation to see what it sends, where, and when it last published.' }}</p>
      <p v-if="actError" class="text-sm text-destructive">{{ actError }}</p>
      <template v-if="act">
        <div class="flex flex-wrap items-start gap-3">
          <div><h2 class="text-lg font-semibold">{{ act.name }}</h2><div class="font-mono text-sm text-muted-foreground">{{ act.developerName }}</div></div>
          <div class="ml-auto flex gap-2">
            <a :class="btn" :href="recordUrl(currentOrg()?.host, act.id)" target="_blank" rel="noopener">Open in Salesforce</a>
          </div>
        </div>
        <dl class="border rounded-md bg-card p-3 grid grid-cols-[10rem_1fr] md:grid-cols-[10rem_1fr_10rem_1fr] gap-x-3 gap-y-1 text-sm">
          <dt class="text-muted-foreground">Segment</dt><dd><RouterLink v-if="segmentApi" :to="`/segments/${segmentApi}`" class="text-link hover:underline">{{ act.segment }}</RouterLink><template v-else>{{ act.segment }}</template></dd>
          <dt class="text-muted-foreground">Target</dt><dd><a v-if="act.targetId" :href="recordUrl(currentOrg()?.host, act.targetId)" target="_blank" rel="noopener" class="text-link hover:underline">{{ act.target }}</a><template v-else>{{ act.target }}</template></dd>
          <dt class="text-muted-foreground">Status</dt><dd>{{ act.status.toLowerCase() }}{{ act.enabled ? '' : ', disabled' }}</dd>
          <dt class="text-muted-foreground">Last publish</dt><dd :class="/fail|error/i.test(act.lastPublishStatus) ? 'text-destructive' : ''">{{ act.lastPublishStatus.toLowerCase() || 'never' }}, {{ when(act.lastPublish) }}</dd>
          <dt class="text-muted-foreground">Refresh</dt><dd>{{ [act.refreshType, act.processing].filter(Boolean).join(', ').toLowerCase() }}{{ act.excludeDeletes ? ', deletes not sent' : '' }}{{ act.excludeUpdates ? ', updates not sent' : '' }}</dd>
          <dt class="text-muted-foreground">Activates</dt><dd>{{ act.subjectLabel || act.subject }} <span class="font-mono text-xs text-muted-foreground">{{ act.subject }}</span></dd>
        </dl>
        <div class="grid lg:grid-cols-2 gap-4">
          <div class="border rounded-md bg-card">
            <h3 class="p-3 border-b font-medium text-sm">Attributes sent ({{ act.attributes.length }})</h3>
            <table class="w-full text-xs">
              <thead class="text-left text-muted-foreground"><tr><th class="p-2 font-normal">Field</th><th class="p-2 font-normal">Sent as</th><th class="p-2 font-normal">Type</th></tr></thead>
              <tbody><tr v-for="x in act.attributes" :key="x.entity + x.name" class="border-t"><td class="p-2"><span class="font-mono">{{ x.entity.replace(/^ssot__|__dlm$/g, '') }}.{{ x.name }}</span><div class="text-muted-foreground">{{ x.label }}</div></td><td class="p-2 font-mono">{{ x.output }}</td><td class="p-2">{{ x.type }}</td></tr></tbody>
            </table>
          </div>
          <div class="space-y-4">
            <div class="border rounded-md bg-card p-3 text-sm space-y-1">
              <div class="font-medium">Contact points</div>
              <p v-if="!act.contactPoints.length" class="text-muted-foreground">None.</p>
              <div v-for="c in act.contactPoints" :key="c.entity"><RouterLink :to="`/objects/${c.entity}`" class="font-mono text-xs text-link hover:underline">{{ c.entity }}</RouterLink><div v-if="c.path.length" class="text-xs text-muted-foreground">through {{ c.path.join(' → ') }}</div></div>
            </div>
            <div class="border rounded-md bg-card p-3 text-sm space-y-1">
              <div class="font-medium">Filters</div>
              <p v-if="!act.filters.length" class="text-muted-foreground">None: every segment member is activated.</p>
              <pre v-for="(f, i) in act.filters" :key="i" class="text-xs font-mono whitespace-pre-wrap">{{ f }}</pre>
            </div>
            <div class="border rounded-md bg-card p-3 text-sm space-y-1">
              <div class="font-medium">Audience</div>
              <div v-for="[label, t] in [['Latest', act.latestAudience], ['History', act.historyAudience]].filter(([, t]) => t)" :key="t" class="flex gap-2">
                <span class="w-16 text-muted-foreground">{{ label }}</span>
                <RouterLink :to="`/objects/${t}`" class="font-mono text-xs text-link hover:underline truncate">{{ t }}</RouterLink>
                <span class="ml-auto">{{ num(counts[t]) }} rows</span>
              </div>
              <div v-if="act.latestAudienceRun" class="text-xs text-muted-foreground">Latest audience built {{ when(act.latestAudienceRun) }}</div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>
