<script setup>
// A related row as a card (lib/personCards.js rowCard): name, chips, the first filled fields,
// and every field on click.
import { ref, computed } from 'vue'
import { rowCard } from '../../lib/personCards.js'
import RecordLink from '../RecordLink.vue'

const props = defineProps({
  row: { type: Object, required: true },
  skip: { type: Array, default: () => [] },
  muted: { type: Boolean, default: false },
  cols: { type: Number, default: 2 },
})
const open = ref(false)
const c = computed(() => rowCard(props.row, { skip: props.skip }))
const all = computed(() => Object.entries(props.row).filter(([, v]) => v != null && v !== ''))
</script>

<template>
  <div :class="['flex flex-col gap-2.5 p-3.5 rounded-[14px] min-w-0', muted ? 'border border-dashed bg-muted/30' : 'border bg-card']">
    <div class="flex items-start justify-between gap-2 min-w-0">
      <span :class="['text-sm font-semibold break-words min-w-0', c.titleMono ? 'font-mono' : '']">{{ c.title || '(no name)' }}</span>
      <span v-if="c.date" class="text-xs text-muted-foreground whitespace-nowrap" :title="c.date.label">{{ c.date.value.slice(0, 10) }}</span>
    </div>
    <div v-if="c.chips.length" class="flex flex-wrap gap-1.5">
      <span v-for="ch in c.chips" :key="ch.text" :class="['dci-badge', ch.tone === 'blue' ? 'dci-badge-blue' : '', ch.mono ? 'font-mono' : '']">{{ ch.text }}</span>
    </div>
    <dl v-if="c.fields.length" :class="['grid gap-2 p-2.5 rounded-[10px] bg-muted/50', cols === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2']">
      <div v-for="f in c.fields" :key="f.key" class="min-w-0">
        <dt class="text-[11px] text-muted-foreground truncate" :title="f.key">{{ f.label }}</dt>
        <dd :class="['text-[13px] font-medium break-words', f.mono ? 'font-mono' : '']">{{ f.value }}</dd>
      </div>
    </dl>
    <slot />
    <button type="button" class="self-start text-xs font-semibold text-link hover:underline" :aria-expanded="open" @click="open = !open">{{ open ? 'Fewer fields' : `All fields${c.more ? ` (${c.more} more)` : ''}` }}</button>
    <dl v-if="open" class="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-3 gap-y-0.5 text-xs">
      <template v-for="[k, v] in all" :key="k"><dt class="font-mono text-muted-foreground break-all">{{ k }}</dt><dd class="break-all"><RecordLink :value="v" /></dd></template>
    </dl>
  </div>
</template>
