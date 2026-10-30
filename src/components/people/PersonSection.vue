<script setup>
// One section of the People > One person page: icon, title, count, and Table / SQL on the
// right. Table swaps the cards for every row and field; SQL opens the query in the SQL page
// (a menu when the section reads more than one object).
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { Code, Maximize2, Minimize2, Table2 } from 'lucide-vue-next'
import RelatedTable from '../RelatedTable.vue'

const props = defineProps({
  title: { type: String, required: true },
  count: { type: [String, Number], default: '' },
  icon: { type: [Object, Function], default: null },
  tone: { type: String, default: 'teal' },
  entries: { type: Array, default: () => [] }, // loadRelated entries: { object, sql, rows, more, error }
  label: { type: Function, default: (o) => o },
  pad: { type: String, default: 'px-5 py-4' },
  compact: { type: Boolean, default: false }, // narrow column: icon-only buttons (full labels when maximized)
})
const router = useRouter()
const table = ref(false)
// Maximize (feedback #1066): the section fills the window; Esc or the button brings it back.
const max = ref(false)
const onKey = (e) => { if (e.key === 'Escape') max.value = false }
watch(max, (on) => { if (on) window.addEventListener('keydown', onKey); else window.removeEventListener('keydown', onKey) })
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
const withSql = computed(() => props.entries.filter((e) => e.sql))
const errors = computed(() => props.entries.filter((e) => e.error))
const toSql = (sql) => router.push({ path: '/sql', query: { sql } })
const TONES = {
  teal: 'bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
  sky: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  blue: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  orange: 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
  pink: 'bg-pink-50 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300',
  green: 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300',
  violet: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
}
</script>

<template>
  <div class="min-w-0">
  <div v-if="max" class="fixed inset-0 z-40 bg-black/40" aria-hidden="true" @click="max = false" />
  <section :class="['dci-card overflow-hidden', max ? 'fixed inset-3 sm:inset-6 z-50 !overflow-auto shadow-2xl' : '']" :role="max ? 'dialog' : undefined" :aria-modal="max ? 'true' : undefined" :aria-label="max ? title : undefined">
    <div :class="[compact && !max ? 'px-[18px]' : 'px-5', 'py-3.5 border-b flex items-center gap-2.5', max ? 'sticky top-0 z-10 bg-card' : '']">
      <h3 class="flex-1 min-w-0 text-base font-semibold flex items-center gap-2.5">
        <span v-if="icon" :class="['w-[30px] h-[30px] shrink-0 rounded-xl flex items-center justify-center', TONES[tone] || TONES.teal]" aria-hidden="true"><component :is="icon" class="w-4 h-4" /></span>
        <span class="truncate" :title="title">{{ title }}</span>
        <span v-if="count !== ''" class="dci-count whitespace-nowrap">{{ count }}</span>
      </h3>
      <div class="shrink-0 flex flex-wrap justify-end items-center gap-1.5">
        <slot name="actions" />
        <button v-if="entries.length" type="button" class="dci-btn dci-btn-sm" :aria-pressed="table" :class="table ? 'is-on' : ''" :aria-label="table ? 'Show cards' : 'Show as a table'" :title="table ? 'Show cards' : 'Show as a table'" @click="table = !table"><Table2 class="w-3.5 h-3.5" /><template v-if="!compact || max"> {{ table ? 'Cards' : 'Table' }}</template></button>
        <button v-if="withSql.length === 1" type="button" class="dci-btn dci-btn-sm" aria-label="SQL" title="Open this query on the SQL page" @click="toSql(withSql[0].sql)"><Code class="w-3.5 h-3.5" /><template v-if="!compact || max"> SQL</template></button>
        <details v-else-if="withSql.length > 1" class="relative">
          <summary class="dci-btn dci-btn-sm list-none cursor-pointer" aria-label="SQL" title="Open a query on the SQL page"><Code class="w-3.5 h-3.5" /><template v-if="!compact"> SQL</template></summary>
          <div class="absolute right-0 z-20 mt-1 w-72 rounded-xl border bg-card shadow-lg p-1 text-sm">
            <button v-for="e in withSql" :key="e.object + e.otherField" type="button" class="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-accent truncate" @click="toSql(e.sql)">{{ label(e.object) }}</button>
          </div>
        </details>
        <button type="button" class="dci-btn dci-btn-sm" :aria-pressed="max" :aria-label="max ? 'Restore' : 'Maximize'" :title="max ? 'Restore (Esc)' : 'Maximize'" @click="max = !max"><component :is="max ? Minimize2 : Maximize2" class="w-3.5 h-3.5" /></button>
      </div>
    </div>
    <div v-if="table" class="px-5 py-4 space-y-4">
      <div v-for="e in entries" :key="e.object + e.otherField" class="space-y-1.5">
        <div class="text-sm flex items-center gap-2">
          <RouterLink :to="`/objects/${e.object}`" class="text-link hover:underline">{{ label(e.object) }}</RouterLink>
          <span class="font-mono text-xs text-muted-foreground">{{ e.object }}<template v-if="e.otherField"> by {{ e.otherField }}</template></span>
          <span class="dci-count">{{ e.rows.length }}{{ e.more ? '+' : '' }} rows</span>
        </div>
        <RelatedTable :rows="e.rows" :max="50" />
      </div>
      <slot name="table" />
    </div>
    <div v-else :class="pad"><slot /></div>
    <p v-for="e in errors" :key="'err' + e.object" class="px-5 pb-3 text-xs text-destructive">{{ label(e.object) }}: {{ e.error }}</p>
  </section>
  </div>
</template>
