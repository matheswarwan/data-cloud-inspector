<script setup>
// Rows of one related object, showing only the columns that have a value somewhere.
import { ref, computed } from 'vue'

const props = defineProps({
  rows: { type: Array, default: () => [] },
  max: { type: Number, default: 10 },
})
const all = ref(false)
const columns = computed(() => {
  const keys = new Set()
  for (const r of props.rows) for (const [k, v] of Object.entries(r)) if (v != null && v !== '') keys.add(k)
  return [...keys]
})
const shown = computed(() => (all.value ? props.rows : props.rows.slice(0, props.max)))
const text = (v) => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v))
</script>

<template>
  <div class="overflow-auto">
    <table class="text-xs font-mono border-collapse">
      <thead>
        <tr><th v-for="c in columns" :key="c" class="px-2 py-1 text-left whitespace-nowrap text-muted-foreground font-normal">{{ c }}</th></tr>
      </thead>
      <tbody>
        <tr v-for="(r, i) in shown" :key="i" class="border-t">
          <td v-for="c in columns" :key="c" class="px-2 py-0.5 whitespace-nowrap max-w-xs overflow-hidden text-ellipsis" :title="text(r[c])">{{ text(r[c]) }}</td>
        </tr>
      </tbody>
    </table>
    <button v-if="rows.length > max && !all" class="text-xs text-primary hover:underline px-2 py-1" @click="all = true">Show all {{ rows.length }}</button>
  </div>
</template>
