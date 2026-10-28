<script setup>
// One table in the query builder (Step 1): its alias, how it joins an earlier table (join type,
// one or more conditions with AND or OR), move up or down, remove.
import { computed } from 'vue'
import { X, ArrowUp, ArrowDown, Plus, TriangleAlert, Wand2 } from 'lucide-vue-next'
import { aliasAt, JOIN_TYPES, JOIN_OPS, onClause, suggestConditions, removeTable, moveTable } from '../../lib/builderModel.js'

const props = defineProps({
  q: { type: Object, required: true },
  table: { type: Object, required: true },
  catalog: { type: Array, required: true },
})
const emit = defineEmits(['moved', 'notice'])
const index = computed(() => props.q.tables.findIndex((t) => t.id === props.table.id))
const alias = computed(() => aliasAt(index.value))
const obj = computed(() => props.catalog.find((o) => o.name === props.table.name))
const join = computed(() => props.q.joins.find((j) => j.tableId === props.table.id) || null)
const earlier = computed(() => props.q.tables.slice(0, index.value).map((t, i) => ({ id: t.id, alias: aliasAt(i), name: t.name, label: props.catalog.find((o) => o.name === t.name)?.label || t.name })))
const parent = computed(() => earlier.value.find((t) => t.id === join.value?.leftId) || null)
const parentFields = computed(() => props.catalog.find((o) => o.name === parent.value?.name)?.fields || [])
const ownFields = computed(() => obj.value?.fields || [])
const complete = computed(() => !join.value || !!onClause(join.value, 'a', 'b'))

function setParent(id) {
  join.value.leftId = id
  suggest()
}
function suggest() {
  const left = props.catalog.find((o) => o.name === parent.value?.name)
  const c = suggestConditions(left, obj.value, props.catalog)
  join.value.conditions = c.length ? c : [{ left: '', op: '=', right: '' }]
  if (!c.length) emit('notice', `No join to suggest between ${parent.value?.alias} and ${alias.value}: pick the fields that hold the same value.`)
}
function move(d) {
  if (!moveTable(props.q, props.table.id, d)) emit('notice', d < 0 ? 'It cannot move up: a table can only join one placed before it, and the first table has no join.' : 'It cannot move down: another table joins to it, or it would end up before the table it joins.')
  else emit('moved')
}
const sel = 'border rounded px-1 py-0.5 bg-background text-xs max-w-full'
</script>

<template>
  <div :class="['border rounded-xl bg-card', complete ? '' : 'border-amber-400']" :data-table="table.id">
    <div class="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
      <span class="font-mono text-xs border rounded px-1 text-muted-foreground">{{ alias }}</span>
      <span class="font-medium">{{ obj?.label || table.name }}</span>
      <span class="font-mono text-xs text-muted-foreground">{{ table.name }}</span>
      <span v-if="obj" class="text-[10px] px-1 rounded bg-muted text-muted-foreground">{{ obj.kind }}</span>
      <span v-else class="text-xs text-destructive">not in this data space</span>
      <span class="ml-auto flex items-center gap-0.5">
        <button class="p-0.5 rounded hover:bg-accent disabled:opacity-30" :disabled="index === 0" :aria-label="`Move ${alias} up`" title="Move up" @click="move(-1)"><ArrowUp class="w-3.5 h-3.5" /></button>
        <button class="p-0.5 rounded hover:bg-accent disabled:opacity-30" :disabled="index === q.tables.length - 1" :aria-label="`Move ${alias} down`" title="Move down" @click="move(1)"><ArrowDown class="w-3.5 h-3.5" /></button>
        <button class="p-0.5 rounded hover:bg-accent" :aria-label="`Remove ${alias}`" title="Remove" @click="removeTable(q, table.id)"><X class="w-3.5 h-3.5" /></button>
      </span>
    </div>
    <div v-if="join" class="px-3 pb-2 space-y-1.5 text-xs">
      <div class="flex flex-wrap items-center gap-1.5">
        <select v-model="join.type" :class="sel" :aria-label="`${alias} join type`" title="Left join keeps every row of the earlier table; inner join keeps only rows that match">
          <option v-for="t in JOIN_TYPES" :key="t" :value="t">{{ t }}</option>
        </select>
        <span class="text-muted-foreground">to</span>
        <select :value="join.leftId" :class="sel" :aria-label="`${alias} joins to`" @change="setParent($event.target.value)">
          <option v-for="t in earlier" :key="t.id" :value="t.id">{{ t.alias }} {{ t.label }}</option>
        </select>
        <select v-if="join.conditions.length > 1" v-model="join.combinator" :class="sel" aria-label="Combine conditions with">
          <option value="AND">all conditions (AND)</option><option value="OR">any condition (OR)</option>
        </select>
        <button class="ml-auto inline-flex items-center gap-1 text-link hover:underline" title="Fill in the join from the metadata or a shared field" @click="suggest"><Wand2 class="w-3 h-3" /> Suggest</button>
      </div>
      <div v-for="(c, k) in join.conditions" :key="k" class="flex flex-wrap items-center gap-1.5">
        <span class="w-8 text-right text-muted-foreground">{{ k ? join.combinator : 'ON' }}</span>
        <select v-model="c.left" :class="[sel, 'font-mono']" :aria-label="`Condition ${k + 1}: ${parent?.alias} field`">
          <option value="">{{ parent?.alias }} field…</option>
          <option v-for="f in parentFields" :key="f.name" :value="f.name">{{ parent?.alias }}.{{ f.name }}</option>
        </select>
        <select v-model="c.op" :class="sel" :aria-label="`Condition ${k + 1} operator`"><option v-for="o in JOIN_OPS" :key="o" :value="o">{{ o }}</option></select>
        <select v-model="c.right" :class="[sel, 'font-mono']" :aria-label="`Condition ${k + 1}: ${alias} field`">
          <option value="">{{ alias }} field…</option>
          <option v-for="f in ownFields" :key="f.name" :value="f.name">{{ alias }}.{{ f.name }}</option>
        </select>
        <button v-if="join.conditions.length > 1" class="p-0.5 rounded hover:bg-accent" :aria-label="`Remove condition ${k + 1}`" @click="join.conditions.splice(k, 1)"><X class="w-3 h-3" /></button>
      </div>
      <div class="flex items-center gap-3 pl-9">
        <button class="inline-flex items-center gap-1 text-link hover:underline" @click="join.conditions.push({ left: '', op: '=', right: '' })"><Plus class="w-3 h-3" /> Add condition</button>
        <span v-if="!complete" class="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400"><TriangleAlert class="w-3 h-3" /> Join condition incomplete</span>
      </div>
    </div>
  </div>
</template>
