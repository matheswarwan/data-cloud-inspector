<script setup>
import { ref, computed, watch } from 'vue'
import { useOrg } from '../app/useOrg.js'
import { sf } from '../lib/api.js'
import { loadSnapshot, compareSnapshots, compareMarkdown } from '../lib/compare.js'

const org = useOrg()
const a = ref(org.orgId)
const b = ref(org.orgs.find((o) => o.orgId !== org.orgId)?.orgId || org.orgId)
watch(() => org.orgs.length, () => {
  if (!a.value) a.value = org.orgId
  if (!b.value || b.value === a.value) b.value = org.orgs.find((o) => o.orgId !== a.value)?.orgId || a.value
})
const busy = ref(false)
const error = ref('')
const diff = ref(null)
const errors = ref([])
const notice = ref('')
const host = (id) => org.orgs.find((o) => o.orgId === id)?.host || id

async function compare() {
  busy.value = true
  error.value = ''
  diff.value = null
  notice.value = ''
  try {
    const [sa, sb] = await Promise.all([loadSnapshot(sf, a.value), loadSnapshot(sf, b.value)])
    diff.value = compareSnapshots(sa, sb)
    errors.value = [...sa.errors.map((e) => `${host(a.value)}: ${e}`), ...sb.errors.map((e) => `${host(b.value)}: ${e}`)]
  } catch (err) {
    error.value = err.message
  } finally {
    busy.value = false
  }
}

const md = computed(() => (diff.value ? compareMarkdown(diff.value, { a: host(a.value), b: host(b.value) }) : ''))
async function copy() { await navigator.clipboard.writeText(md.value); notice.value = 'Copied the comparison as Markdown.' }
function download() {
  const url = URL.createObjectURL(new Blob([md.value], { type: 'text/markdown' }))
  Object.assign(document.createElement('a'), { href: url, download: `data-cloud-comparison-${new Date().toISOString().slice(0, 10)}.md` }).click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

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
      <h2 class="text-lg font-semibold">Compare two orgs</h2>
      <p class="text-sm text-muted-foreground">For example a sandbox and production: objects, fields, segments, calculated insights and data streams that exist in only one, and field type changes. Default data space in each org.</p>
    </div>
    <p v-if="org.orgs.length < 2" class="text-sm p-3 border rounded-md bg-card">Only one org is logged in in this browser. Log in to the second org in another tab, then choose Find orgs again in the connection menu.</p>
    <form class="flex flex-wrap items-center gap-2 text-sm" @submit.prevent="compare">
      <select v-model="a" class="border rounded-md px-2 py-1.5 bg-background"><option v-for="o in org.orgs" :key="o.orgId" :value="o.orgId">{{ o.host }}</option></select>
      <span class="text-muted-foreground">and</span>
      <select v-model="b" class="border rounded-md px-2 py-1.5 bg-background"><option v-for="o in org.orgs" :key="o.orgId" :value="o.orgId">{{ o.host }}</option></select>
      <button class="px-3 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50" :disabled="busy || !a || !b">{{ busy ? 'Comparing…' : 'Compare' }}</button>
    </form>
    <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
    <p v-for="e in errors" :key="e" class="text-xs text-destructive">{{ e }}</p>

    <template v-if="diff">
      <div class="flex gap-2">
        <button :class="btn" @click="copy">Copy as Markdown</button>
        <button :class="btn" @click="download">Download Markdown</button>
        <span v-if="notice" class="text-sm text-muted-foreground self-center">{{ notice }}</span>
      </div>
      <p v-if="diff.same" :class="[card, 'p-3 text-sm']">No differences in objects, fields, segments, calculated insights or data streams.</p>
      <template v-else>
        <div class="grid md:grid-cols-2 gap-4">
          <div v-for="[side, key] in [[a, 'objectsOnlyA'], [b, 'objectsOnlyB']]" :key="key" :class="card">
            <h3 class="p-3 border-b font-medium">Objects only in {{ host(side) }} ({{ diff[key].length }})</h3>
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
            <div v-if="c.fieldsOnlyA.length">Only in {{ host(a) }}: <span class="font-mono text-xs">{{ c.fieldsOnlyA.join(', ') }}</span></div>
            <div v-if="c.fieldsOnlyB.length">Only in {{ host(b) }}: <span class="font-mono text-xs">{{ c.fieldsOnlyB.join(', ') }}</span></div>
            <div v-for="t in c.typeChanges" :key="t.field"><span class="font-mono text-xs">{{ t.field }}</span>: {{ t.a }} in {{ host(a) }}, {{ t.b }} in {{ host(b) }}</div>
          </div>
        </div>
        <div :class="[card, 'grid md:grid-cols-3']">
          <div v-for="[title, ka, kb] in pairs" :key="title" class="p-3 text-sm space-y-1 border-b md:border-b-0 md:border-r last:border-0">
            <div class="font-medium">{{ title }}</div>
            <div>Only in {{ host(a) }}: <span class="font-mono text-xs">{{ diff[ka].join(', ') || 'none' }}</span></div>
            <div>Only in {{ host(b) }}: <span class="font-mono text-xs">{{ diff[kb].join(', ') || 'none' }}</span></div>
          </div>
        </div>
      </template>
    </template>
  </section>
</template>
