<script setup>
// One movable block of a page with Customize layout: while editing, a bar with its name and
// place, Half / Full and up/down arrows, and the block can be dragged onto another.
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-vue-next'

const props = defineProps({
  name: { type: String, required: true },
  index: { type: Number, required: true },
  count: { type: Number, required: true },
  full: { type: Boolean, default: true },
  editing: { type: Boolean, default: false },
  over: { type: Boolean, default: false },
  dragging: { type: Boolean, default: false },
})
const emit = defineEmits(['span', 'move', 'dragstart', 'dragover', 'drop', 'dragend'])
function start(e) {
  if (!props.editing) return
  try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', props.name) } catch { /* old browsers */ }
  emit('dragstart')
}
</script>

<template>
  <div
    :draggable="editing"
    :style="{ order: index }"
    :class="['min-w-0 flex flex-col gap-2 rounded-[18px] transition-[opacity,box-shadow]', full ? '@3xl:col-span-2' : '', editing ? 'p-2 outline-2 ' + (over ? 'outline outline-primary bg-primary/10 shadow-[0_0_0_6px_rgba(13,148,136,0.12)]' : 'outline-dashed outline-primary/40 bg-primary/[0.03]') : '', dragging ? 'opacity-45' : '']"
    @dragstart="start" @dragover="editing && ($event.preventDefault(), emit('dragover'))" @drop="editing && ($event.preventDefault(), emit('drop'))" @dragend="emit('dragend')"
  >
    <div v-if="editing" class="flex flex-wrap items-center gap-2.5 px-1 py-0.5 cursor-grab">
      <GripVertical class="w-4 h-4 text-primary" aria-hidden="true" />
      <span class="text-[13px] font-bold text-primary">{{ name }}</span>
      <span class="text-xs text-muted-foreground">{{ index + 1 }} of {{ count }}</span>
      <span class="ml-auto flex items-center gap-1.5">
        <span role="group" :aria-label="`Width of ${name}`" class="inline-flex p-0.5 rounded-full border border-primary/30 bg-card">
          <button v-for="w in ['half', 'full']" :key="w" type="button" :aria-pressed="(w === 'full') === full" :class="['h-[26px] px-2.5 rounded-full text-xs font-semibold capitalize', (w === 'full') === full ? 'bg-primary text-primary-foreground' : 'text-primary']" @click="emit('span', w)">{{ w }}</button>
        </span>
        <button type="button" class="w-[30px] h-[30px] rounded-full border border-primary/30 bg-card text-primary flex items-center justify-center disabled:opacity-40" :disabled="index === 0" :aria-label="`Move ${name} up`" @click="emit('move', -1)"><ChevronUp class="w-4 h-4" /></button>
        <button type="button" class="w-[30px] h-[30px] rounded-full border border-primary/30 bg-card text-primary flex items-center justify-center disabled:opacity-40" :disabled="index === count - 1" :aria-label="`Move ${name} down`" @click="emit('move', 1)"><ChevronDown class="w-4 h-4" /></button>
      </span>
    </div>
    <div class="@container min-w-0"><slot /></div>
  </div>
</template>
