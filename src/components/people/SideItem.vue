<script setup>
// A related row in the narrow column: name and date, chips, a line of fields, every field on click.
import { ref, computed } from 'vue'
import { rowCard } from '../../lib/personCards.js'
import RecordLink from '../RecordLink.vue'

const props = defineProps({
  row: { type: Object, required: true },
  skip: { type: Array, default: () => [] },
})
const open = ref(false)
const c = computed(() => rowCard(props.row, { skip: props.skip, maxFields: 3 }))
const all = computed(() => Object.entries(props.row).filter(([, v]) => v != null && v !== ''))
</script>

<template>
  <div class="flex flex-col gap-1 min-w-0">
    <button type="button" class="text-left flex flex-col gap-1 min-w-0" :aria-expanded="open" @click="open = !open">
      <span class="flex items-baseline justify-between gap-2">
        <span :class="['text-[13px] font-semibold break-words min-w-0', c.titleMono ? 'font-mono' : '']">{{ c.date ? `${c.date.value.slice(0, 10)} · ` : '' }}{{ c.title || '(no name)' }}</span>
      </span>
      <span v-if="c.fields.length" class="text-[11px] text-muted-foreground break-words">
        <template v-for="(f, i) in c.fields" :key="f.key">{{ i ? ' · ' : '' }}{{ f.label }} <code v-if="f.mono" class="font-mono text-foreground">{{ f.value }}</code><template v-else>{{ f.value }}</template></template>
      </span>
    </button>
    <span v-if="c.chips.length" class="flex flex-wrap gap-1">
      <span v-for="ch in c.chips" :key="ch.text" :class="['dci-badge', ch.tone === 'blue' ? 'dci-badge-blue font-mono' : '']">{{ ch.text }}</span>
    </span>
    <dl v-if="open" class="mt-1 grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-2 gap-y-0.5 text-[11px]">
      <template v-for="[k, v] in all" :key="k"><dt class="font-mono text-muted-foreground break-all">{{ k }}</dt><dd class="break-all"><RecordLink :value="v" /></dd></template>
    </dl>
  </div>
</template>
