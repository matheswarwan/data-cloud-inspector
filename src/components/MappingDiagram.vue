<script setup>
// One DLO to DMO field mapping drawn like Data Cloud's mapping canvas (feedback #1027): source
// fields on the left, target fields on the right, a line for each mapped pair. Rows have a fixed
// height so the lines are placed without measuring the page.
import { computed, ref } from 'vue'

const props = defineProps({
  mapping: { type: Object, required: true }, // { source, target, fields: [{ source, target }] }
  sourceObject: { type: Object, default: null }, // catalog object, for labels and keys
  targetObject: { type: Object, default: null },
})
const emit = defineEmits(['pick'])

const ROW = 30
const showUnmapped = ref(false)

function fieldInfo(obj, name) {
  const f = obj?.fields?.find((x) => x.name === name)
  return { name, label: f?.label || name, type: f?.type || '', key: !!f?.primaryKey }
}

const left = computed(() => [...new Set(props.mapping.fields.map((f) => f.source))]
  .map((n) => fieldInfo(props.sourceObject, n))
  .sort((a, b) => a.label.localeCompare(b.label)))
const right = computed(() => [...new Set(props.mapping.fields.map((f) => f.target))]
  .map((n) => fieldInfo(props.targetObject, n))
  .sort((a, b) => a.label.localeCompare(b.label)))
const lines = computed(() => props.mapping.fields.map((f) => {
  const y1 = left.value.findIndex((x) => x.name === f.source) * ROW + ROW / 2
  const y2 = right.value.findIndex((x) => x.name === f.target) * ROW + ROW / 2
  return { key: `${f.source}>${f.target}`, d: `M0 ${y1} C 60 ${y1}, 100 ${y2}, 160 ${y2}` }
}))
const height = computed(() => Math.max(left.value.length, right.value.length) * ROW)

const unmappedSource = computed(() => {
  const used = new Set(props.mapping.fields.map((f) => f.source))
  return (props.sourceObject?.fields || []).filter((f) => !used.has(f.name))
})
const unmappedTarget = computed(() => {
  const used = new Set(props.mapping.fields.map((f) => f.target))
  return (props.targetObject?.fields || []).filter((f) => !used.has(f.name))
})
</script>

<template>
  <div class="text-xs">
    <div class="grid grid-cols-[minmax(0,1fr)_160px_minmax(0,1fr)] gap-0 font-semibold mb-1">
      <button class="text-left truncate text-link hover:underline" :title="mapping.source" @click="emit('pick', mapping.source)">{{ sourceObject?.label || mapping.source }}</button>
      <span />
      <button class="text-left truncate text-link hover:underline" :title="mapping.target" @click="emit('pick', mapping.target)">{{ targetObject?.label || mapping.target }}</button>
    </div>
    <div class="grid grid-cols-[minmax(0,1fr)_160px_minmax(0,1fr)] gap-0 text-muted-foreground mb-1">
      <span>Is mapped ({{ left.length }})</span><span /><span>Is mapped ({{ right.length }})</span>
    </div>
    <div class="grid grid-cols-[minmax(0,1fr)_160px_minmax(0,1fr)] gap-0">
      <ul class="border rounded-md divide-y overflow-hidden">
        <li v-for="f in left" :key="f.name" class="flex items-center gap-2 px-2 bg-card" :style="{ height: `${ROW}px` }" :title="`${f.name}${f.type ? ` (${f.type})` : ''}`">
          <span class="truncate font-mono">{{ f.key ? '* ' : '' }}{{ f.name }}</span>
          <span v-if="f.key" class="ml-auto shrink-0 text-muted-foreground">Primary key</span>
        </li>
      </ul>
      <svg :width="160" :height="height" :viewBox="`0 0 160 ${height}`" class="text-teal-700 dark:text-teal-300" aria-hidden="true">
        <path v-for="l in lines" :key="l.key" :d="l.d" fill="none" stroke="currentColor" stroke-opacity="0.55" stroke-width="1.25" />
      </svg>
      <ul class="border rounded-md divide-y overflow-hidden">
        <li v-for="f in right" :key="f.name" class="flex items-center gap-2 px-2 bg-card" :style="{ height: `${ROW}px` }" :title="`${f.name}${f.type ? ` (${f.type})` : ''}`">
          <span class="truncate">{{ f.key ? '* ' : '' }}{{ f.label }}</span>
          <span v-if="f.key" class="ml-auto shrink-0 text-muted-foreground">Primary key</span>
        </li>
      </ul>
    </div>
    <div v-if="unmappedSource.length || unmappedTarget.length" class="mt-2">
      <button class="text-link hover:underline" @click="showUnmapped = !showUnmapped">{{ showUnmapped ? 'Hide' : 'Show' }} unmapped fields ({{ unmappedSource.length }} source, {{ unmappedTarget.length }} target)</button>
      <div v-if="showUnmapped" class="grid grid-cols-2 gap-3 mt-1">
        <ul class="font-mono space-y-0.5"><li v-for="f in unmappedSource" :key="f.name" class="truncate">{{ f.name }}</li></ul>
        <ul class="space-y-0.5"><li v-for="f in unmappedTarget" :key="f.name" class="truncate" :title="f.name">{{ f.label }}</li></ul>
      </div>
    </div>
  </div>
</template>
