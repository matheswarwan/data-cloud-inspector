<script setup>
// Objects to pick from in the SQL page (feedback #86): search DLOs, DMOs and calculated
// insights, expand one to see its fields, and insert the object, a field or a SELECT.
import { ref, computed } from 'vue'
import Loading from './Loading.vue'
import { ChevronRight, ChevronDown } from 'lucide-vue-next'
import { useCatalog } from '../app/useCatalog.js'
import { filterObjects } from '../lib/catalog.js'
import { groupObjects } from '../lib/objectGroups.js'

const emit = defineEmits(['insert'])
const catalog = useCatalog()
const text = ref('')
const open = ref(null) // object name
const fieldText = ref('')
const ticked = ref([])

// Grouped and ordered by likely use (feedback #1035), at most 300 objects shown.
const groups = computed(() => {
  let left = 300
  return groupObjects(filterObjects(catalog.objects, { text: text.value }))
    .map((g) => { const objects = g.objects.slice(0, Math.max(0, left)); left -= objects.length; return { ...g, objects } })
    .filter((g) => g.objects.length)
})
const selected = computed(() => catalog.objects.find((o) => o.name === open.value) || null)
const fields = computed(() => {
  const t = fieldText.value.trim().toLowerCase()
  const all = selected.value?.fields || []
  return t ? all.filter((f) => f.name.toLowerCase().includes(t) || f.label.toLowerCase().includes(t)) : all
})

function toggle(name) {
  open.value = open.value === name ? null : name
  fieldText.value = ''
  ticked.value = []
}

function selectSql(o) {
  const names = ticked.value.length ? o.fields.filter((f) => ticked.value.includes(f.name)).map((f) => f.name) : o.fields.map((f) => f.name)
  return `SELECT\n  ${(names.length ? names : ['*']).join(',\n  ')}\nFROM ${o.name}\nLIMIT 100`
}
</script>

<template>
  <div class="space-y-2 text-sm">
    <input v-model="text" placeholder="Search objects" class="w-full border rounded-md px-2 py-1 bg-background" />
    <Loading v-if="catalog.loading" text="Loading objects…" />
    <ul class="max-h-[70vh] overflow-auto">
      <template v-for="g in groups" :key="g.key">
      <li class="sticky top-0 z-10 bg-card px-1 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{{ g.label }} <span class="font-normal">{{ g.objects.length }}</span></li>
      <li v-for="o in g.objects" :key="o.name">
        <button class="w-full text-left px-1 py-1 rounded hover:bg-accent flex items-start gap-1" :title="o.name" @click="toggle(o.name)">
          <component :is="open === o.name ? ChevronDown : ChevronRight" class="w-3.5 h-3.5 mt-1 shrink-0 text-muted-foreground" />
          <span class="min-w-0">
            <span class="block truncate">{{ o.label }} <span class="text-[10px] border rounded px-1 text-muted-foreground">{{ o.kind }}</span></span>
            <span class="block font-mono text-[11px] text-muted-foreground truncate">{{ o.name }}</span>
          </span>
        </button>
        <div v-if="open === o.name" class="ml-5 mb-2 space-y-1">
          <div class="flex flex-wrap gap-1">
            <button class="px-2 py-0.5 rounded border text-xs hover:bg-accent" @click="emit('insert', o.name)">Insert name</button>
            <button class="px-2 py-0.5 rounded border text-xs hover:bg-accent" title="Inserts a SELECT of every field, or of the ticked ones, at the cursor" @click="emit('insert', selectSql(o))">
              Insert SELECT{{ ticked.length ? ` (${ticked.length})` : '' }}
            </button>
          </div>
          <input v-if="o.fields.length > 8" v-model="fieldText" placeholder="Filter fields" class="w-full border rounded px-2 py-0.5 bg-background text-xs" />
          <ul class="text-xs">
            <li v-for="f in fields" :key="f.name" class="flex items-center gap-1.5 py-0.5">
              <input v-model="ticked" type="checkbox" :value="f.name" :aria-label="`Use ${f.name} in Insert SELECT`" />
              <button class="font-mono truncate hover:underline text-left" :title="`${f.label} (${f.businessType || f.type}). Click to insert.`" @click="emit('insert', f.name)">{{ f.name }}</button>
            </li>
          </ul>
        </div>
      </li>
      </template>
    </ul>
  </div>
</template>
