<script setup>
import DataTable from './DataTable.vue'
// A calculated insight's definition: status, schedule, last run, the SQL (formatted) and its
// dimensions and measures with formulas. Used by Objects and Calculated insights.
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { formatDialect, sql as ansiSql } from 'sql-formatter'

defineProps({ ci: { type: Object, required: true }, partitionBy: { type: String, default: '' }, show: { type: String, default: 'all' } })
const router = useRouter()
const copied = ref(false)
const time = (iso) => (iso ? new Date(iso).toLocaleString() : '')
function prettySql(text) {
  try { return formatDialect(text, { dialect: ansiSql, keywordCase: 'upper' }) } catch { return text }
}
async function copySql(text) {
  await navigator.clipboard.writeText(text)
  copied.value = true
  setTimeout(() => { copied.value = false }, 1500)
}
const fieldCols = [
  { key: 'name', label: 'Field', value: (f) => `${f.name} ${f.label || ''}`, sortValue: (f) => f.name },
  { key: 'role', label: 'Role' },
  { key: 'type', label: 'Type', value: (f) => `${f.type}${f.granularity ? `, by ${f.granularity.toLowerCase()}` : ''}${f.aggregation ? `, ${f.aggregation.toLowerCase()}` : ''}` },
  { key: 'formula', label: 'Formula' },
]
</script>

<template>
  <div class="space-y-3 text-sm">
            <p v-if="ci.description && (show === 'all' || show === 'details')" class="text-muted-foreground">{{ ci.description }}</p>
            <div v-if="show === 'all' || show === 'details'" class="border rounded-md bg-card p-3 grid grid-cols-[10rem_1fr] md:grid-cols-[10rem_1fr_10rem_1fr] gap-x-3 gap-y-1">
              <span class="text-muted-foreground">Status</span><span>{{ [ci.status, ci.definitionStatus].filter(Boolean).join(', ').toLowerCase() }}{{ ci.enabled ? '' : ' (disabled)' }}</span>
              <span class="text-muted-foreground">Type</span><span>{{ ci.type.replace(/_/g, ' ').toLowerCase() }}{{ ci.fromPackage ? ', from a package' : '' }}</span>
              <span class="text-muted-foreground">Schedule</span><span>{{ ci.schedule.replace(/_/g, ' ').toLowerCase() || 'none' }}</span>
              <span class="text-muted-foreground">Last run</span><span :class="/fail|error/i.test(ci.lastRunStatus) ? 'text-destructive' : ''">{{ ci.lastRunStatus.toLowerCase() || 'never' }}{{ ci.lastRun ? `, ${time(ci.lastRun)}` : '' }}{{ ci.lastRunError ? ` (${ci.lastRunError})` : '' }}</span>
              <span class="text-muted-foreground">Partitioned by</span><span class="font-mono text-xs">{{ partitionBy || 'none' }}</span>
              <span class="text-muted-foreground">Dialect</span><span>{{ ci.dialect }}</span>
            </div>
            <div v-if="show === 'all' || show === 'sql'" class="border rounded-md bg-card">
              <div class="p-2 border-b flex items-center gap-2">
                <span class="font-medium">SQL</span>
                <button class="ml-auto text-xs text-link hover:underline" @click="copySql(ci.sql)">{{ copied ? 'Copied' : 'Copy SQL' }}</button>
                <button class="text-xs text-link hover:underline" @click="router.push({ path: '/sql', query: { sql: ci.sql } })">Open in a SQL tab</button>
              </div>
              <pre class="p-3 text-xs font-mono whitespace-pre-wrap break-words">{{ prettySql(ci.sql) }}</pre>
              <p class="px-3 pb-2 text-xs text-muted-foreground">Calculated insight SQL uses its own dialect, so it may need small edits before it runs as a query (for example DATE_ADD with a zero offset).</p>
            </div>
            <DataTable v-if="show === 'all' || show === 'fields'" :columns="fieldCols" :rows="[...ci.dimensions, ...ci.measures]" row-key="name">
              <template #cell-name="{ row: f }"><span class="font-mono text-xs">{{ f.name }}</span><div class="text-xs text-muted-foreground">{{ f.label }}</div></template>
              <template #cell-role="{ value }"><span class="text-xs">{{ value }}</span></template>
              <template #cell-type="{ value }"><span class="text-xs">{{ value }}</span></template>
              <template #cell-formula="{ value }"><span class="font-mono text-xs break-all">{{ value }}</span></template>
            </DataTable>
  </div>
</template>
