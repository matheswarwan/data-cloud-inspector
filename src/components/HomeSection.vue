<script setup>
// A Home section (feedback #1022): folds like an accordion; move it up or down, or drag
// its header onto another section.
import { ChevronDown, ChevronRight, ArrowUp, ArrowDown, GripVertical } from 'lucide-vue-next'
defineProps({ id: { type: String, required: true }, title: { type: String, required: true }, folded: Boolean, first: Boolean, last: Boolean })
const emit = defineEmits(['toggle', 'move', 'drop'])
</script>

<template>
  <section class="border rounded-md bg-card" :data-section="id" @dragover.prevent @drop.prevent="emit('drop', $event.dataTransfer.getData('text/dci-home'))">
    <div class="flex items-center gap-1 px-2 py-1.5" :class="folded ? '' : 'border-b'" draggable="true" @dragstart="$event.dataTransfer.setData('text/dci-home', id)">
      <GripVertical class="w-4 h-4 text-muted-foreground/60 cursor-grab shrink-0" aria-hidden="true" />
      <button class="flex-1 flex items-center gap-1.5 text-left font-medium text-sm py-0.5" :aria-expanded="!folded" @click="emit('toggle')">
        <ChevronRight v-if="folded" class="w-4 h-4" /><ChevronDown v-else class="w-4 h-4" />{{ title }}
      </button>
      <slot name="actions" />
      <button class="p-1 rounded hover:bg-accent disabled:opacity-30" :disabled="first" :aria-label="`Move ${title} up`" title="Move up" @click="emit('move', -1)"><ArrowUp class="w-3.5 h-3.5" /></button>
      <button class="p-1 rounded hover:bg-accent disabled:opacity-30" :disabled="last" :aria-label="`Move ${title} down`" title="Move down" @click="emit('move', 1)"><ArrowDown class="w-3.5 h-3.5" /></button>
    </div>
    <div v-if="!folded" class="p-3"><slot /></div>
  </section>
</template>
