<script setup>
// JSON shown properly (feedback #115): a Tree you can open and search (click a key to copy
// its path, a value to copy it), a Graph of the objects inside, and the formatted Text, with
// Copy and Download. Accepts a value or a JSON text.
import { ref, reactive, computed, watch, defineAsyncComponent } from 'vue'
import JsonNode from './JsonNode.vue'
import { parseJson, searchPaths, isBranch, jsonPath } from '../lib/jsonView.js'
import { saveBlob, safeFileName } from '../lib/exportDoc.js'
const JsonGraph = defineAsyncComponent(() => import('./JsonGraph.vue'))

const props = defineProps({
  value: { required: true },
  fileName: { type: String, default: 'data' },
  openDepth: { type: Number, default: 2 },
  boxClass: { type: String, default: 'max-h-[60vh]' },
  compact: { type: Boolean, default: false },
})
const parsed = computed(() => parseJson(props.value))
const data = computed(() => (parsed.value.ok ? parsed.value.value : undefined))
const text = computed(() => (parsed.value.ok ? JSON.stringify(data.value, null, 2) : String(props.value)))
const mode = ref('tree')
const search = ref('')
const note = ref('')

function openTo(depth) {
  const open = new Set()
  const walk = (v, path) => {
    if (!isBranch(v) || path.length >= depth) return
    open.add(jsonPath(path))
    for (const [k, x] of Object.entries(v)) walk(x, [...path, Array.isArray(v) ? Number(k) : k])
  }
  walk(data.value, [])
  return open
}
const state = reactive({ open: new Set(), hits: new Set(), copy })
watch(data, () => { state.open = openTo(props.openDepth) }, { immediate: true })
watch(search, (t) => {
  const { hits, open } = searchPaths(data.value, t)
  state.hits = hits
  if (t.trim()) state.open = new Set([...state.open, ...open])
})
const expandAll = () => { state.open = openTo(Infinity) }
const collapseAll = () => { state.open = new Set(['$']) }

async function copy(t, what = 'the JSON') {
  try { await navigator.clipboard.writeText(t); note.value = `Copied ${what}.` } catch { note.value = 'Could not copy.' }
  setTimeout(() => { note.value = '' }, 1500)
}
const download = () => saveBlob(new Blob([text.value], { type: 'application/json' }), `${safeFileName(props.fileName)}.json`)
const tabBtn = (m) => ['px-2 py-0.5 rounded', mode.value === m ? 'bg-accent font-medium' : 'hover:bg-accent text-muted-foreground']
</script>

<template>
  <div class="space-y-1.5 text-xs min-w-0">
    <div class="flex flex-wrap items-center gap-1.5">
      <template v-if="parsed.ok">
        <button :class="tabBtn('tree')" @click="mode = 'tree'">Tree</button>
        <button v-if="isBranch(data)" :class="tabBtn('graph')" @click="mode = 'graph'">Graph</button>
        <button :class="tabBtn('text')" @click="mode = 'text'">Text</button>
        <template v-if="mode === 'tree' && isBranch(data)">
          <input v-model="search" placeholder="Search keys and values" class="ml-1 border rounded px-1.5 py-0.5 bg-background w-44" />
          <span v-if="search.trim()" class="text-muted-foreground">{{ state.hits.size }} found</span>
          <button v-if="!compact" class="text-link hover:underline" @click="expandAll">Open all</button>
          <button v-if="!compact" class="text-link hover:underline" @click="collapseAll">Close all</button>
        </template>
      </template>
      <span v-else class="text-muted-foreground">Not valid JSON ({{ parsed.error }}); shown as text.</span>
      <span class="ml-auto flex items-center gap-2">
        <span v-if="note" class="text-muted-foreground">{{ note }}</span>
        <button class="text-link hover:underline" @click="copy(text)">Copy</button>
        <button class="text-link hover:underline" @click="download">Download .json</button>
      </span>
    </div>
    <div v-if="mode === 'tree' && parsed.ok" :class="['border rounded-md p-2 overflow-auto font-mono bg-card', boxClass]">
      <JsonNode :value="data" :state="state" />
    </div>
    <JsonGraph v-else-if="mode === 'graph'" :value="data" :copy="copy" />
    <pre v-else :class="['border rounded-md p-2 overflow-auto font-mono whitespace-pre-wrap break-all bg-card', boxClass]">{{ text }}</pre>
  </div>
</template>
