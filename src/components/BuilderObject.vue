<script setup>
// One object in the Query Builder: its fields to tick, how it is joined, and the related
// objects that can be added under it (recursively).
import { ref, computed } from 'vue'
import { X } from 'lucide-vue-next'
import { joinOptions, addJoin, removeJoin, guessJoin } from '../lib/queryBuilder.js'

const props = defineProps({
  model: { type: Object, required: true },
  alias: { type: String, required: true },
  catalog: { type: Array, required: true },
  depth: { type: Number, default: 0 },
})

const join = computed(() => props.model.joins.find((j) => j.alias === props.alias) || null)
const objectName = computed(() => (props.alias === 't0' ? props.model.base : join.value?.object))
const obj = computed(() => props.catalog.find((o) => o.name === objectName.value))
const fieldList = computed(() => (props.alias === 't0' ? props.model.fields : join.value?.fields || []))
const filter = ref('')
const shown = computed(() => {
  const t = filter.value.trim().toLowerCase()
  const all = obj.value?.fields || []
  return t ? all.filter((f) => f.name.toLowerCase().includes(t) || f.label.toLowerCase().includes(t)) : all
})
const options = computed(() => joinOptions(objectName.value, props.catalog))
const children = computed(() => props.model.joins.filter((j) => j.parent === props.alias))
const adding = ref('')

function setFields(list) {
  if (props.alias === 't0') props.model.fields = list
  else join.value.fields = list
}
function toggle(name) {
  const cur = fieldList.value
  setFields(cur.includes(name) ? cur.filter((f) => f !== name) : [...cur, name])
}
function add() {
  const opt = options.value[Number(adding.value)]
  if (opt) addJoin(props.model, props.alias, opt)
  adding.value = ''
}
// Join any object, choosing the fields yourself (feedback #100): for objects the metadata
// does not relate, such as most DLOs.
const custom = ref(null) // { text, object, objectField, otherField }
const otherObj = computed(() => props.catalog.find((o) => o.name === custom.value?.object) || null)
const objectChoices = computed(() => [...props.catalog].sort((a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label)))
function pickOther() {
  const c = custom.value
  const t = c.text.trim()
  const hit = props.catalog.find((o) => o.name === t) || props.catalog.find((o) => `${o.label} (${o.name})` === t)
  c.object = hit?.name || ''
  if (hit) Object.assign(c, guessJoin(obj.value, hit, props.catalog))
}
function addCustom() {
  const c = custom.value
  if (!c.object || !c.objectField || !c.otherField) return
  addJoin(props.model, props.alias, { object: c.object, objectField: c.objectField, otherField: c.otherField })
  custom.value = null
}
const listId = computed(() => `dci-builder-objects-${props.alias}`)
const short = (f) => f.replace(/^ssot__/, '').replace(/__c$/, '')
const parentLabel = computed(() => (join.value ? `${join.value.alias}.${short(join.value.field)} = ${join.value.parent}.${short(join.value.parentField)}` : ''))
</script>

<template>
  <div class="border rounded-md bg-card" :class="depth ? 'ml-5' : ''">
    <div class="p-2 border-b flex flex-wrap items-center gap-2 text-sm">
      <span class="font-mono text-xs border rounded px-1 text-muted-foreground">{{ alias }}</span>
      <span class="font-medium">{{ obj?.label || objectName }}</span>
      <span class="font-mono text-xs text-muted-foreground">{{ objectName }}</span>
      <template v-if="join">
        <span class="text-xs text-muted-foreground">joined on {{ parentLabel }}</span>
        <select v-model="join.type" class="ml-auto border rounded px-1 py-0.5 bg-background text-xs" title="Inner join keeps only rows that have a match; left join keeps every row of the parent">
          <option value="LEFT">may be missing (left join)</option>
          <option value="INNER">must match (inner join)</option>
        </select>
        <button class="p-0.5 rounded hover:bg-accent" :aria-label="`Remove ${obj?.label}`" @click="removeJoin(model, alias)"><X class="w-3.5 h-3.5" /></button>
      </template>
    </div>
    <div class="p-2 space-y-1.5 text-xs">
      <div class="flex items-center gap-2">
        <input v-model="filter" placeholder="Filter fields" class="border rounded px-2 py-0.5 bg-background w-48" />
        <button class="text-link hover:underline" @click="setFields(obj.fields.map((f) => f.name))">All</button>
        <button class="text-link hover:underline" @click="setFields([])">None</button>
        <span class="text-muted-foreground ml-auto">{{ fieldList.length }} of {{ obj?.fields.length || 0 }} fields</span>
      </div>
      <div class="grid grid-cols-2 xl:grid-cols-3 gap-x-3 gap-y-0.5 max-h-44 overflow-auto">
        <label v-for="f in shown" :key="f.name" class="flex items-center gap-1.5 min-w-0" :title="`${f.label} (${f.businessType || f.type})`">
          <input type="checkbox" :checked="fieldList.includes(f.name)" @change="toggle(f.name)" />
          <span class="font-mono truncate">{{ f.name }}</span>
        </label>
      </div>
      <div class="flex flex-wrap items-center gap-2 pt-1">
        <select v-if="options.length" v-model="adding" class="border rounded px-1 py-0.5 bg-background max-w-md" @change="add">
          <option value="">Add a related object…</option>
          <option v-for="(o, i) in options" :key="o.object + o.otherField + o.objectField" :value="i">{{ o.label }} ({{ o.object }}.{{ o.otherField }} = {{ o.objectField }})</option>
        </select>
        <span v-else class="text-muted-foreground">The metadata relates no objects to this one.</span>
        <button v-if="!custom" class="text-link hover:underline" @click="custom = { text: '', object: '', objectField: '', otherField: '' }">Join another object…</button>
      </div>
      <div v-if="custom" class="border rounded p-2 space-y-1.5 bg-background">
        <div class="flex flex-wrap items-center gap-2">
          <label class="text-muted-foreground" :for="`${listId}-input`">Object</label>
          <input :id="`${listId}-input`" v-model="custom.text" :list="listId" placeholder="Type to search DLOs, DMOs and calculated insights" class="border rounded px-2 py-0.5 bg-background w-96 max-w-full" @change="pickOther" @input="pickOther" />
          <datalist :id="listId"><option v-for="o in objectChoices" :key="o.name" :value="o.name">{{ o.kind }} · {{ o.label }}</option></datalist>
          <button class="ml-auto p-0.5 rounded hover:bg-accent" aria-label="Cancel joining another object" @click="custom = null"><X class="w-3.5 h-3.5" /></button>
        </div>
        <div v-if="otherObj" class="flex flex-wrap items-center gap-2">
          <span class="text-muted-foreground">Join on</span>
          <select v-model="custom.otherField" class="border rounded px-1 py-0.5 bg-background font-mono" :aria-label="`${otherObj.label} field`">
            <option value="">{{ otherObj.label }} field…</option>
            <option v-for="f in otherObj.fields" :key="f.name" :value="f.name">{{ f.name }}</option>
          </select>
          <span>=</span>
          <select v-model="custom.objectField" class="border rounded px-1 py-0.5 bg-background font-mono" :aria-label="`${obj?.label} field`">
            <option value="">{{ obj?.label }} field…</option>
            <option v-for="f in obj?.fields || []" :key="f.name" :value="f.name">{{ alias }}.{{ f.name }}</option>
          </select>
          <button class="px-2 py-0.5 rounded border hover:bg-accent disabled:opacity-50" :disabled="!custom.objectField || !custom.otherField" @click="addCustom">Add join</button>
        </div>
        <p v-if="otherObj && !custom.objectField" class="text-muted-foreground">No field pair to suggest; pick the two fields that hold the same value.</p>
      </div>
    </div>
  </div>
  <BuilderObject v-for="c in children" :key="c.alias" :model="model" :alias="c.alias" :catalog="catalog" :depth="depth + 1" />
</template>
