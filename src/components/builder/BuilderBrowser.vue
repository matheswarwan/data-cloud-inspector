<script setup>
// Query builder, left: every object to add, grouped (DMOs, DLOs, calculated insights) and
// searchable; click one to add it to the query. Objects already in the query are marked.
import { ref, computed } from 'vue'
import Loading from '../Loading.vue'
import { Search, ChevronDown, ChevronRight, Plus, Check } from 'lucide-vue-next'

const props = defineProps({
  objects: { type: Array, default: () => [] },
  used: { type: Array, default: () => [] }, // API names in the query
  loading: { type: Boolean, default: false },
})
const emit = defineEmits(['add'])
const text = ref('')
const GROUPS = [['DMO', 'Data model objects'], ['DLO', 'Data lake objects'], ['CI', 'Calculated insights']]
const closed = ref({})
const groups = computed(() => {
  const t = text.value.trim().toLowerCase()
  const match = (o) => !t || o.name.toLowerCase().includes(t) || o.label.toLowerCase().includes(t)
  return GROUPS.map(([kind, title]) => ({ kind, title, items: props.objects.filter((o) => o.kind === kind && match(o)).sort((a, b) => a.label.localeCompare(b.label)) })).filter((g) => g.items.length)
})
const isUsed = (name) => props.used.includes(name)
</script>

<template>
  <div class="flex flex-col h-full min-h-0 border rounded-xl bg-card">
    <div class="p-2 border-b">
      <label class="flex items-center gap-1.5 border rounded-md px-2 py-1 bg-background">
        <Search class="w-3.5 h-3.5 text-muted-foreground" />
        <input v-model="text" placeholder="Search all objects" class="flex-1 bg-transparent text-sm outline-none min-w-0" aria-label="Search all objects" />
      </label>
    </div>
    <Loading v-if="loading && !objects.length" text="Reading the metadata…" />
    <div class="flex-1 overflow-auto text-sm">
      <div v-for="g in groups" :key="g.kind">
        <button class="sticky top-0 z-[1] w-full flex items-center gap-1 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground bg-card border-b hover:bg-accent" :aria-expanded="!closed[g.kind] || !!text.trim()" @click="closed[g.kind] = !closed[g.kind]">
          <component :is="closed[g.kind] && !text.trim() ? ChevronRight : ChevronDown" class="w-3.5 h-3.5" /> {{ g.title }} <span class="ml-auto font-normal">{{ g.items.length }}</span>
        </button>
        <ul v-if="!closed[g.kind] || text.trim()">
          <li v-for="o in g.items" :key="o.name">
            <button class="group w-full flex items-start gap-1.5 px-2 py-1 text-left hover:bg-accent" :title="`Add ${o.name}`" @click="emit('add', o.name)">
              <component :is="isUsed(o.name) ? Check : Plus" :class="['w-3.5 h-3.5 mt-0.5 shrink-0', isUsed(o.name) ? 'text-green-600' : 'text-muted-foreground opacity-0 group-hover:opacity-100']" />
              <span class="min-w-0">
                <span class="block truncate">{{ o.label }}</span>
                <span class="block font-mono text-[11px] text-muted-foreground truncate">{{ o.name }}</span>
              </span>
            </button>
          </li>
        </ul>
      </div>
      <p v-if="!loading && !groups.length" class="p-3 text-xs text-muted-foreground">No objects match.</p>
    </div>
  </div>
</template>
