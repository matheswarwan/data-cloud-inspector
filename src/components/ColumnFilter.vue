<script setup>
// The filter button in a table header and its pop-up: "contains" text, plus a pick list
// when the column has few distinct values. `filter` is { text, values } (values null = all).
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { ListFilter } from 'lucide-vue-next'
import { distinctValues, filterActive } from '../lib/tableView.js'

const props = defineProps({
  label: { type: String, required: true },
  rows: { type: Array, default: () => [] },
  col: { type: Object, required: true }, // { key, value?(row) }
  filter: { type: Object, required: true },
})

const open = ref(false)
const pos = ref({ top: 0, left: 0 })
const pop = ref(null)
const btn = ref(null)
const picks = computed(() => (open.value ? distinctValues(props.rows, props.col) : null))

function toggle() {
  if (open.value) { open.value = false; return }
  const r = btn.value.getBoundingClientRect()
  pos.value = { top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - 272)) }
  open.value = true
  nextTick(() => pop.value?.querySelector('input')?.focus())
}
const isPicked = (value) => !props.filter.values || props.filter.values.includes(value)
function togglePick(value) {
  const all = picks.value.map((p) => p.value)
  const cur = props.filter.values || all
  const next = cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value]
  props.filter.values = next.length === all.length ? null : next
}
function clear() { props.filter.text = ''; props.filter.values = null }

function onDoc(e) { if (pop.value && !pop.value.contains(e.target) && !btn.value?.contains(e.target)) open.value = false }
function onKey(e) { if (e.key === 'Escape') open.value = false }
function onScroll(e) { if (pop.value && !pop.value.contains(e.target)) open.value = false }
watch(open, (v) => {
  const m = v ? 'addEventListener' : 'removeEventListener'
  document[m]('pointerdown', onDoc, true)
  document[m]('keydown', onKey)
  document[m]('scroll', onScroll, true)
})
onBeforeUnmount(() => { open.value = false })
</script>

<template>
  <button
    ref="btn" type="button"
    :class="['p-0.5 rounded hover:bg-accent shrink-0', filterActive(filter) ? 'text-link' : 'opacity-50 hover:opacity-100']"
    :title="`Filter ${label}`" :aria-label="`Filter ${label}`" :aria-expanded="open"
    @click.stop="toggle"
  ><ListFilter class="w-3 h-3" /></button>
  <Teleport to="body">
    <div
      v-if="open" ref="pop" role="dialog" :aria-label="`Filter ${label}`"
      class="fixed z-50 w-64 border rounded-xl bg-card text-foreground font-sans font-normal shadow-lg p-2 space-y-2 text-sm text-left"
      :style="{ top: `${pos.top}px`, left: `${pos.left}px` }"
    >
      <input v-model="filter.text" placeholder="Contains" class="w-full border rounded-md px-2 py-1 bg-background" />
      <template v-if="picks">
        <div class="flex gap-2 text-xs">
          <button class="text-link hover:underline" @click="filter.values = null">All</button>
          <button class="text-link hover:underline" @click="filter.values = []">None</button>
        </div>
        <ul class="max-h-60 overflow-auto">
          <li v-for="p in picks" :key="p.value" class="group flex items-center gap-2 px-1 py-0.5 rounded hover:bg-accent">
            <label class="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
              <input type="checkbox" :checked="isPicked(p.value)" @change="togglePick(p.value)" />
              <span :class="['truncate', p.value ? '' : 'italic text-muted-foreground']">{{ p.value || '(blank)' }}</span>
            </label>
            <button class="text-xs text-link opacity-0 group-hover:opacity-100 focus:opacity-100" @click="filter.values = [p.value]">only</button>
            <span class="text-xs text-muted-foreground">{{ p.count }}</span>
          </li>
        </ul>
      </template>
      <p v-else class="text-xs text-muted-foreground">Too many different values for a list; filter by text.</p>
      <div class="flex justify-end"><button class="text-xs text-link hover:underline" @click="clear">Clear</button></div>
    </div>
  </Teleport>
</template>
