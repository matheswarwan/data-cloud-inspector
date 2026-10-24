<script setup>
// One key and value in the JSON tree (JsonViewer). Objects and arrays open and close;
// click a key to copy its path, a plain value to copy the value.
import { computed } from 'vue'
import { ChevronRight, ChevronDown } from 'lucide-vue-next'
import { jsonPath, isBranch, kindOf } from '../lib/jsonView.js'

const props = defineProps({
  value: { required: true },
  name: { type: [String, Number], default: null },
  path: { type: Array, default: () => [] },
  state: { type: Object, required: true }, // { open: Set, hits: Set, copy(text, what) }
  inArray: { type: Boolean, default: false },
})
const p = computed(() => jsonPath(props.path))
const branch = computed(() => isBranch(props.value))
const isOpen = computed(() => props.state.open.has(p.value))
const entries = computed(() => (branch.value && isOpen.value ? Object.entries(props.value).map(([k, v]) => [Array.isArray(props.value) ? Number(k) : k, v]) : []))
const size = computed(() => (branch.value ? Object.keys(props.value).length : 0))
// The brackets shown next to an object or array: open, or with how many entries it holds.
const summary = computed(() => {
  const [o, c] = Array.isArray(props.value) ? ['[', ']'] : ['{', '}']
  if (isOpen.value) return o
  const n = size.value
  return `${o} ${n} ${Array.isArray(props.value) ? (n === 1 ? 'item' : 'items') : n === 1 ? 'key' : 'keys'} ${c}`
})
const hit = computed(() => props.state.hits.has(p.value))
function toggle() {
  const s = props.state.open
  if (s.has(p.value)) s.delete(p.value); else s.add(p.value)
}
const COLOR = { string: 'text-emerald-700 dark:text-emerald-400', number: 'text-sky-700 dark:text-sky-400', boolean: 'text-violet-700 dark:text-violet-400', null: 'text-muted-foreground italic' }
const shown = (v) => (typeof v === 'string' ? JSON.stringify(v) : String(v))
</script>

<template>
  <div class="leading-5">
    <div :class="['flex items-start gap-1 rounded px-0.5', hit ? 'bg-amber-200/60 dark:bg-amber-500/30' : '']">
      <button v-if="branch" class="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground" :aria-label="isOpen ? 'Close' : 'Open'" :aria-expanded="isOpen" @click="toggle"><component :is="isOpen ? ChevronDown : ChevronRight" class="w-3.5 h-3.5" /></button>
      <span v-else class="w-3.5 shrink-0" />
      <button v-if="name !== null" class="shrink-0 hover:underline" :class="inArray ? 'text-muted-foreground' : 'text-rose-800 dark:text-rose-300'" :title="`Copy the path ${p}`" @click="state.copy(p, 'the path')">{{ inArray ? name : JSON.stringify(String(name)) }}</button>
      <span v-if="name !== null" class="text-muted-foreground">:</span>
      <template v-if="branch">
        <button class="text-muted-foreground hover:text-foreground" @click="toggle">{{ summary }}</button>
      </template>
      <button v-else class="break-all text-left hover:underline" :class="COLOR[kindOf(value)]" title="Copy the value" @click="state.copy(typeof value === 'string' ? value : String(value), 'the value')">{{ shown(value) }}</button>
    </div>
    <div v-if="entries.length" class="pl-4 border-l ml-1.5">
      <JsonNode v-for="[k, v] in entries" :key="k" :value="v" :name="k" :path="[...path, k]" :state="state" :in-array="Array.isArray(value)" />
    </div>
  </div>
</template>
