<script setup>
import PageHeader from '../components/PageHeader.vue'
// Marketing flows (Marketing Cloud Next, analysis doc 2026-10-27): every Flow Builder flow
// with its type, trigger and status, filtered to the marketing ones by a loose guess;
// open one for its start (segment, event, record, schedule) and steps in run order, read
// from the active (else latest) version's metadata with the Tooling API. Read only.
import { ref, computed, onMounted, watch, onBeforeUnmount } from 'vue'
import { orgCached } from '../lib/store.js'
import { metadataTtl } from '../lib/cacheAge.js'
import { RefreshCw, X, ExternalLink } from 'lucide-vue-next'
import DataTable from '../components/DataTable.vue'
import Loading from '../components/Loading.vue'
import JsonViewer from '../components/JsonViewer.vue'
import FlowDiagram from '../components/FlowDiagram.vue'
import HelpTip from '../components/HelpTip.vue'
import { useOrg, currentOrg } from '../app/useOrg.js'
import { orgCall } from '../app/useCatalog.js'
import { loadFlows, isMarketingFlow, flowTypes, loadFlowVersion, flowSteps, startSummary } from '../lib/flows.js'

const org = useOrg()
const flows = ref([])
const loading = ref(false)
const error = ref('')
const only = ref('marketing') // marketing | all | <ProcessType>

// Kept in this browser and shown at once (feedback #1043); Load again reads the org now.
async function load({ refresh = false } = {}) {
  if (!org.version) return
  loading.value = true
  error.value = ''
  const key = `dci_s_${org.orgId}_${org.dataSpace || 'default'}_flows`
  try { flows.value = await orgCached(key, metadataTtl(), () => loadFlows(orgCall(), org.version), { refresh, onUpdate: (v) => { flows.value = v } }) } catch (e) { error.value = e.message } finally { loading.value = false }
}
onMounted(load)
watch(() => [org.orgId, org.version], load)

const marketing = computed(() => flows.value.filter(isMarketingFlow))
const types = computed(() => flowTypes(flows.value))
const shown = computed(() => only.value === 'marketing' ? marketing.value : only.value === 'all' ? flows.value : flows.value.filter((f) => (f.ProcessType || 'Unknown') === only.value))
watch(flows, () => { if (only.value === 'marketing' && flows.value.length && !marketing.value.length) only.value = 'all' })

const columns = [
  { key: 'Label', label: 'Flow' },
  { key: 'ProcessType', label: 'Type' },
  { key: 'TriggerType', label: 'Trigger', value: (f) => [f.TriggerType, f.TriggerObjectOrEventLabel].filter(Boolean).join(' · ') },
  { key: 'IsActive', label: 'Active', value: (f) => (f.IsActive ? 'Active' : 'Inactive') },
  { key: 'LastModifiedDate', label: 'Modified', value: (f) => (f.LastModifiedDate ? new Date(f.LastModifiedDate).toLocaleString() : '') },
]

// One flow: its version's start and steps.
const open = ref(null)
async function openFlow(f) {
  const versionId = f.ActiveVersionId || f.LatestVersionId
  const o = { flow: f, versionId, loading: true, error: '', metadata: null, start: null, steps: [], startLinks: [] }
  open.value = o
  try {
    const md = await loadFlowVersion(orgCall(), org.version, versionId)
    if (open.value?.flow !== f) return
    const { start, steps, startLinks } = flowSteps(md)
    open.value = { ...o, loading: false, metadata: md.Metadata || md, start, steps, startLinks }
  } catch (e) {
    if (open.value?.flow === f) open.value = { ...o, loading: false, error: e.message }
  }
}
const builderUrl = (versionId) => (currentOrg()?.host && versionId ? `https://${currentOrg().host}/builder_platform_interaction/flowBuilder.app?flowId=${versionId}` : '')
const onKey = (e) => { if (e.key === 'Escape') open.value = null }
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
const panelTab = ref('diagram')
const chip = (on) => ['px-2 py-0.5 rounded-full border text-xs', on ? 'bg-accent font-medium' : 'hover:bg-accent']
</script>

<template>
  <section class="max-w-6xl mx-auto space-y-4">
    <div class="flex items-start gap-3">
      <div>
        <PageHeader path="/flows" title="Marketing flows" topic="flows">Flows with their type, trigger and status. Open one for what starts it and its steps in order. Marketing Cloud Next sends email, SMS and WhatsApp from these flows.</PageHeader>
      </div>
      <button class="ml-auto shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-sm hover:bg-accent disabled:opacity-50" :disabled="loading" @click="load({ refresh: true })"><RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" /> Load again</button>
    </div>
    <Loading v-if="loading && !flows.length" text="Reading flows" />
    <p v-else-if="error" class="text-sm text-destructive">{{ error }}</p>
    <template v-else>
      <div class="flex flex-wrap gap-1.5" aria-label="Flow types">
        <button :class="chip(only === 'marketing')" title="Types and triggers that look like marketing (segment, event, activation, Data Cloud, on demand, broadcast)" @click="only = 'marketing'">Marketing (guess) {{ marketing.length }}</button>
        <button :class="chip(only === 'all')" @click="only = 'all'">All {{ flows.length }}</button>
        <button v-for="t in types" :key="t.type" :class="chip(only === t.type)" @click="only = t.type">{{ t.type }} {{ t.count }}</button>
      </div>
      <p v-if="only === 'marketing' && !marketing.length" class="text-sm text-muted-foreground">No flow type looks like a marketing flow here. This org may not have Marketing Cloud Next; All lists every flow.</p>
      <DataTable :columns="columns" :rows="shown" row-key="Id" empty="No flows.">
        <template #cell-Label="{ row: f }"><button class="text-link hover:underline text-left" @click="openFlow(f)">{{ f.Label }}</button><div class="font-mono text-xs text-muted-foreground">{{ f.ApiName }}</div></template>
      </DataTable>
    </template>

    <div v-if="open" class="fixed inset-x-0 bottom-0 top-[49px] z-20 bg-black/30" @mousedown.self="open = null">
      <aside role="dialog" :aria-label="`Flow ${open.flow.Label}`" class="absolute right-0 top-0 h-full w-[56rem] max-w-full bg-card border-l shadow-2xl flex flex-col">
        <div class="p-3 border-b flex items-start gap-2">
          <div class="min-w-0">
            <div class="font-medium truncate">{{ open.flow.Label }}</div>
            <div class="text-xs text-muted-foreground">{{ [open.flow.ProcessType, open.flow.IsActive ? 'active' : 'inactive', open.flow.ActiveVersionId ? 'active version' : 'latest version'].filter(Boolean).join(' · ') }}</div>
          </div>
          <a v-if="builderUrl(open.versionId)" :href="builderUrl(open.versionId)" target="_blank" rel="noopener" class="ml-auto shrink-0 inline-flex items-center gap-1 text-xs text-link hover:underline">Open in Flow Builder <ExternalLink class="w-3 h-3" /></a>
          <button class="shrink-0 p-1 rounded hover:bg-accent" title="Close (Esc)" @click="open = null"><X class="w-4 h-4" /></button>
        </div>
        <div class="flex-1 min-h-0 overflow-auto p-3 text-sm space-y-3">
          <p v-if="open.flow.Description" class="text-muted-foreground">{{ open.flow.Description }}</p>
          <p v-if="open.loading" class="text-muted-foreground">Reading the flow version…</p>
          <p v-else-if="open.error" class="text-destructive">{{ open.error }}</p>
          <template v-else>
            <div><span class="font-medium">Starts:</span> {{ startSummary(open.start) || 'not stated in the metadata' }}</div>
            <div class="flex gap-1 text-xs" role="tablist">
              <button v-for="[k, l] in [['diagram', 'Diagram'], ['steps', 'Steps']]" :key="k" role="tab" :aria-selected="panelTab === k" :class="chip(panelTab === k)" @click="panelTab = k">{{ l }}</button>
            </div>
            <FlowDiagram v-if="panelTab === 'diagram' && open.steps.length" :steps="open.steps" :start-links="open.startLinks" :start-text="startSummary(open.start)" :file-name="`flow-${open.flow.ApiName}`" />
            <ol v-if="panelTab === 'steps'" class="list-decimal ml-5 space-y-1">
              <li v-for="s in open.steps" :key="s.name"><span class="font-medium">{{ s.label }}</span> <span class="text-xs text-muted-foreground">{{ s.type }}{{ s.detail ? `: ${s.detail}` : '' }}</span></li>
            </ol>
            <p v-if="!open.steps.length" class="text-muted-foreground">No steps in this version.</p>
            <details><summary class="cursor-pointer text-xs text-muted-foreground">Metadata (tree, graph, download)</summary><JsonViewer :value="open.metadata" :file-name="`flow-${open.flow.ApiName}`" /></details>
          </template>
        </div>
      </aside>
    </div>
  </section>
</template>
