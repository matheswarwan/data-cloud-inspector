<script setup>
// Query results. Shows at most `limit` rows (rendering more makes the page slow);
// the full set is still available through Download CSV.
import { computed } from 'vue'

const props = defineProps({
  columns: { type: Array, default: () => [] },
  rows: { type: Array, default: () => [] },
  limit: { type: Number, default: 5000 },
})

const shown = computed(() => props.rows.slice(0, props.limit))
const text = (v) => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v))
</script>

<template>
  <div class="border rounded-md overflow-auto bg-card max-h-[60vh]">
    <table class="text-xs font-mono border-collapse">
      <thead class="sticky top-0 bg-card shadow-[0_1px_0_hsl(var(--border))]">
        <tr>
          <th class="px-2 py-1 text-right text-muted-foreground font-normal">#</th>
          <th v-for="c in columns" :key="c.name" class="px-2 py-1 text-left whitespace-nowrap">
            <div class="font-semibold">{{ c.name }}</div>
            <div class="text-muted-foreground font-normal">{{ c.type }}</div>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(r, i) in shown" :key="i" class="border-t hover:bg-accent">
          <td class="px-2 py-0.5 text-right text-muted-foreground">{{ i + 1 }}</td>
          <td
            v-for="(v, j) in r" :key="j"
            class="px-2 py-0.5 whitespace-nowrap max-w-md overflow-hidden text-ellipsis"
            :class="{ 'text-muted-foreground italic': v == null }" :title="text(v)"
          >{{ v == null ? 'null' : text(v) }}</td>
        </tr>
      </tbody>
    </table>
    <div v-if="rows.length > limit" class="p-2 text-xs text-muted-foreground">
      Showing the first {{ limit.toLocaleString() }} of {{ rows.length.toLocaleString() }} loaded rows. Download CSV has all of them.
    </div>
  </div>
</template>
