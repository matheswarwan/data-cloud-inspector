<script setup>
// A table with sorting (click a header) and a filter per column (ColumnFilter). Cells render
// through `#cell-<key>` slots ({ row, value }), a `#cell` slot ({ row, col, value }) or as
// plain text; `#after-row` ({ row, colspan }) adds a row under each row. Emits `view` with
// the rows after filters and sort, for downloads.
import { ref, reactive, computed, watch } from 'vue'
import { ArrowUp, ArrowDown } from 'lucide-vue-next'
import ColumnFilter from './ColumnFilter.vue'
import { tableRows, nextSort, filterActive, colValue, valueText } from '../lib/tableView.js'

const props = defineProps({
  columns: { type: Array, required: true },
  rows: { type: Array, default: () => [] },
  rowKey: { type: [String, Function], default: null },
  rowClass: { type: [String, Function], default: '' },
  empty: { type: String, default: 'Nothing to show.' },
  // Classes for the scroll box, e.g. a max height; the table scrolls inside it.
  boxClass: { type: String, default: '' },
  bordered: { type: Boolean, default: true },
  textSize: { type: String, default: 'text-sm' },
  initialSort: { type: Object, default: null },
  // Show the first `limit` rows (after filters and sort) with a Show all button; 0 shows all.
  limit: { type: Number, default: 0 },
})
const emit = defineEmits(['view', 'row-click'])

const sort = ref(props.initialSort)
const filters = reactive({})
const filterOf = (key) => (filters[key] ||= { text: '', values: null })

const shown = computed(() => tableRows(props.rows, props.columns, { sort: sort.value, filters }))
const showAll = ref(false)
const visible = computed(() => (props.limit && !showAll.value ? shown.value.slice(0, props.limit) : shown.value))
const anyFilter = computed(() => Object.values(filters).some(filterActive))
watch(shown, (v) => emit('view', v), { immediate: true })

const keyOf = (row, i) => (typeof props.rowKey === 'function' ? props.rowKey(row) : props.rowKey ? row[props.rowKey] : i)
const classOf = (row) => (typeof props.rowClass === 'function' ? props.rowClass(row) : props.rowClass)
const sortable = (c) => c.sort !== false
const filterable = (c) => c.filter !== false
function clickSort(c) { if (sortable(c)) sort.value = nextSort(sort.value, c.key) }
function clearAll() { for (const k of Object.keys(filters)) delete filters[k] }
</script>

<template>
  <div class="min-w-0">
    <div v-if="anyFilter" class="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
      <span>{{ shown.length.toLocaleString() }} of {{ rows.length.toLocaleString() }} rows</span>
      <button class="text-link hover:underline" @click="clearAll">Clear filters</button>
    </div>
    <div :class="['overflow-auto', bordered ? 'border rounded-md bg-card' : '', boxClass]">
      <table :class="['w-full', textSize]">
        <thead class="text-left text-muted-foreground sticky top-0 bg-card shadow-[0_1px_0_hsl(var(--border))] z-[1]">
          <tr>
            <th v-for="c in columns" :key="c.key" :class="['p-2 font-normal align-bottom', c.headerClass, c.align === 'right' ? 'text-right' : '']">
              <div :class="['inline-flex items-center gap-0.5', c.align === 'right' ? 'flex-row-reverse' : '']">
                <button v-if="sortable(c)" class="hover:text-foreground whitespace-nowrap" :title="`Sort by ${c.label}`" @click="clickSort(c)">{{ c.label }}</button>
                <span v-else class="whitespace-nowrap">{{ c.label }}</span>
                <ArrowUp v-if="sort?.key === c.key && sort.dir === 'asc'" class="w-3 h-3 shrink-0" />
                <ArrowDown v-else-if="sort?.key === c.key && sort.dir === 'desc'" class="w-3 h-3 shrink-0" />
                <ColumnFilter v-if="filterable(c)" :label="c.label" :rows="rows" :col="c" :filter="filterOf(c.key)" />
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          <template v-for="(row, i) in visible" :key="keyOf(row, i)">
            <tr :class="['border-t align-top', classOf(row)]" @click="emit('row-click', row)">
              <td v-for="c in columns" :key="c.key" :class="['p-2', c.class, c.align === 'right' ? 'text-right' : '']">
                <slot :name="`cell-${c.key}`" :row="row" :value="colValue(c, row)"><slot name="cell" :row="row" :col="c" :value="colValue(c, row)">{{ valueText(colValue(c, row)) }}</slot></slot>
              </td>
            </tr>
            <slot name="after-row" :row="row" :colspan="columns.length" />
          </template>
          <tr v-if="!shown.length"><td :colspan="columns.length" class="p-3 text-muted-foreground">{{ rows.length ? 'No rows match the filters.' : empty }}</td></tr>
        </tbody>
      </table>
      <button v-if="visible.length < shown.length" class="text-xs text-link hover:underline px-2 py-1" @click="showAll = true">Show all {{ shown.length.toLocaleString() }}</button>
    </div>
  </div>
</template>
