<script setup>
import DownloadMenu from '../components/DownloadMenu.vue'
import HelpTip from '../components/HelpTip.vue'
import { ref, computed, watch } from 'vue'
import { Pencil } from 'lucide-vue-next'
import { useOrg, orgName, renameSavedOrg } from '../app/useOrg.js'
import { askText } from '../app/useDialog.js'
import { sf } from '../lib/api.js'
import { loadSnapshot, compareSnapshots, compareMarkdown } from '../lib/compare.js'
import { useJob, startJob, markSeen } from '../app/useJobs.js'

const org = useOrg()
const a = ref(org.orgId)
const b = ref(org.orgs.find((o) => o.orgId !== org.orgId)?.orgId || org.orgId)
watch(() => org.orgs.length, () => {
  if (!a.value) a.value = org.orgId
  if (!b.value || b.value === a.value) b.value = org.orgs.find((o) => o.orgId !== a.value)?.orgId || a.value
})
const notice = ref('')
const host = (id) => org.orgs.find((o) => o.orgId === id)?.host || id
// Names (feedback #140): an alias per org, shown here, in reports and in the connection menu;
// the same names as Your orgs on Home.
const option = (o) => (orgName(o.orgId) !== o.host ? `${orgName(o.orgId)} (${o.host})` : o.host)
async function rename(id) {
  if (!id) return
  const res = await askText({ title: 'Name this org', message: host(id), value: org.saved[id]?.name || '', placeholder: 'For example Client A sandbox', primary: 'Save' })
  if (res) await renameSavedOrg(id, res.value)
}
// A finished comparison shows the names as they are now (renaming after a run updates it)
const labelA = computed(() => org.saved[ran.value.a]?.name || ran.value.hostA)
const labelB = computed(() => org.saved[ran.value.b]?.name || ran.value.hostB)

// The comparison runs as a background job: leave the page and come back for the result.
const job = useJob('compare')
const busy = computed(() => job.status === 'running')
const error = computed(() => (job.status === 'failed' ? job.error : ''))
const diff = computed(() => job.result?.diff || null)
const errors = computed(() => job.result?.errors || [])
const ran = computed(() => job.params || {})
watch(() => job.status, (st) => { if (st !== 'running') markSeen('compare') }, { immediate: true })
watch(() => job.params, (p) => { if (p?.a) { a.value = p.a; b.value = p.b } }, { immediate: true })

function compare() {
  notice.value = ''
  const ha = orgName(a.value)
  const hb = orgName(b.value)
  startJob('compare', async (progress) => {
    let left = 2
    const step = (name) => (snap) => { progress(`read ${name}${--left ? ', reading the other org' : ''}`); return snap }
    progress(`reading ${ha} and ${hb}`)
    const [sa, sb] = await Promise.all([loadSnapshot(sf, a.value).then(step(ha)), loadSnapshot(sf, b.value).then(step(hb))])
    return {
      diff: compareSnapshots(sa, sb),
      errors: [...sa.errors.map((e) => `${ha}: ${e}`), ...sb.errors.map((e) => `${hb}: ${e}`)],
    }
  }, { params: { a: a.value, b: b.value, hostA: host(a.value), hostB: host(b.value) } })
}

const md = computed(() => (diff.value ? compareMarkdown(diff.value, { a: labelA.value, b: labelB.value, hosts: { a: ran.value.hostA, b: ran.value.hostB } }) : ''))

const card = 'border rounded-md bg-card'
const btn = 'inline-flex items-center px-2.5 py-1.5 rounded-md border text-sm hover:bg-accent disabled:opacity-50'
const pairs = [
  ['Segments', 'segmentsOnlyA', 'segmentsOnlyB'],
  ['Calculated insights', 'insightsOnlyA', 'insightsOnlyB'],
  ['Data streams', 'streamsOnlyA', 'streamsOnlyB'],
]
</script>

<template>
  <section class="max-w-6xl mx-auto space-y-4">
    <div>
      <h2 class="text-lg font-semibold">Compare two orgs <HelpTip topic="compare" /></h2>
      <p class="text-sm text-muted-foreground">For example a sandbox and production: objects, fields, segments, calculated insights and data streams that exist in only one, and field type changes. Default data space in each org.</p>
    </div>
    <p v-if="org.orgs.length < 2" class="text-sm p-3 border rounded-md bg-card">Only one org is logged in in this browser. Log in to the second org in another tab, then choose Find orgs again in the connection menu.</p>
    <form class="flex flex-wrap items-center gap-2 text-sm" @submit.prevent="compare">
      <select v-model="a" aria-label="First org" class="border rounded-md px-2 py-1.5 bg-background"><option v-for="o in org.orgs" :key="o.orgId" :value="o.orgId">{{ option(o) }}</option></select>
      <button type="button" class="p-1.5 rounded-md border hover:bg-accent" title="Name this org" aria-label="Name the first org" @click="rename(a)"><Pencil class="w-3.5 h-3.5" /></button>
      <span class="text-muted-foreground">and</span>
      <select v-model="b" aria-label="Second org" class="border rounded-md px-2 py-1.5 bg-background"><option v-for="o in org.orgs" :key="o.orgId" :value="o.orgId">{{ option(o) }}</option></select>
      <button type="button" class="p-1.5 rounded-md border hover:bg-accent" title="Name this org" aria-label="Name the second org" @click="rename(b)"><Pencil class="w-3.5 h-3.5" /></button>
      <button class="px-3 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50" :disabled="busy || !a || !b">{{ busy ? 'Comparing…' : 'Compare' }}</button>
    </form>
    <p v-if="busy" class="text-sm text-muted-foreground">Comparing: {{ job.progress || 'starting' }}. You can use other pages meanwhile; the result waits here.</p>
    <p v-else-if="diff && job.finishedAt" class="text-sm text-muted-foreground">Compared {{ labelA }} and {{ labelB }} at {{ new Date(job.finishedAt).toLocaleString() }}.</p>
    <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
    <p v-for="e in errors" :key="e" class="text-xs text-destructive">{{ e }}</p>

    <template v-if="diff">
      <div class="flex gap-2">
        <DownloadMenu :get-markdown="() => md" file-name="data-cloud-comparison" />
        <span v-if="notice" class="text-sm text-muted-foreground self-center">{{ notice }}</span>
      </div>
      <p v-if="diff.same" :class="[card, 'p-3 text-sm']">No differences in objects, fields, segments, calculated insights or data streams.</p>
      <template v-else>
        <div class="grid md:grid-cols-2 gap-4">
          <div v-for="[side, key] in [['A', 'objectsOnlyA'], ['B', 'objectsOnlyB']]" :key="key" :class="card">
            <h3 class="p-3 border-b font-medium">Objects only in {{ side === 'A' ? labelA : labelB }} ({{ diff[key].length }})</h3>
            <ul class="p-3 text-sm space-y-0.5">
              <li v-for="o in diff[key]" :key="o.name"><span class="text-[10px] border rounded px-1 text-muted-foreground mr-1">{{ o.kind }}</span>{{ o.label }} <span class="font-mono text-xs text-muted-foreground">{{ o.name }}</span></li>
              <li v-if="!diff[key].length" class="text-muted-foreground">None.</li>
            </ul>
          </div>
        </div>
        <div :class="card">
          <h3 class="p-3 border-b font-medium">Objects in both with field differences ({{ diff.changed.length }})</h3>
          <p v-if="!diff.changed.length" class="p-3 text-sm text-muted-foreground">None.</p>
          <div v-for="c in diff.changed" :key="c.name" class="p-3 border-b last:border-0 text-sm space-y-0.5">
            <div class="font-medium">{{ c.label }} <span class="font-mono text-xs text-muted-foreground">{{ c.name }}</span></div>
            <div v-if="c.fieldsOnlyA.length">Only in {{ labelA }}: <span class="font-mono text-xs">{{ c.fieldsOnlyA.join(', ') }}</span></div>
            <div v-if="c.fieldsOnlyB.length">Only in {{ labelB }}: <span class="font-mono text-xs">{{ c.fieldsOnlyB.join(', ') }}</span></div>
            <div v-for="t in c.typeChanges" :key="t.field"><span class="font-mono text-xs">{{ t.field }}</span>: {{ t.a }} in {{ labelA }}, {{ t.b }} in {{ labelB }}</div>
          </div>
        </div>
        <div :class="[card, 'grid md:grid-cols-3']">
          <div v-for="[title, ka, kb] in pairs" :key="title" class="p-3 text-sm space-y-1 border-b md:border-b-0 md:border-r last:border-0">
            <div class="font-medium">{{ title }}</div>
            <div>Only in {{ labelA }}: <span class="font-mono text-xs">{{ diff[ka].join(', ') || 'none' }}</span></div>
            <div>Only in {{ labelB }}: <span class="font-mono text-xs">{{ diff[kb].join(', ') || 'none' }}</span></div>
          </div>
        </div>
      </template>
    </template>
  </section>
</template>
