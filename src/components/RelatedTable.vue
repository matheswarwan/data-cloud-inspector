<script setup>
// Rows of one related object, showing only the columns that have a value somewhere.
import { computed } from 'vue'
import RecordLink from './RecordLink.vue'
import DataTable from './DataTable.vue'

const props = defineProps({
  rows: { type: Array, default: () => [] },
  max: { type: Number, default: 10 },
})
const columns = computed(() => {
  const keys = new Set()
  for (const r of props.rows) for (const [k, v] of Object.entries(r)) if (v != null && v !== '') keys.add(k)
  return [...keys].map((k) => ({ key: k, label: k, headerClass: 'whitespace-nowrap font-mono', class: 'py-0.5 whitespace-nowrap max-w-xs overflow-hidden text-ellipsis' }))
})
const text = (v) => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v))
</script>

<template>
  <DataTable :columns="columns" :rows="rows" :limit="max" :bordered="false" text-size="text-xs font-mono">
    <template #cell="{ value }"><span :title="text(value)"><RecordLink :value="value" /></span></template>
  </DataTable>
</template>
