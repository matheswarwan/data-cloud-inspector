<script setup>
// The list on the left of a list-and-detail page: drag its edge to resize (double-click
// resets), hide it to give the detail the whole width. Remembered per page (`name`).
import { reactive, watch } from 'vue'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-vue-next'
import { readPanel, writePanel, clampWidth } from '../lib/panelLayout.js'

const props = defineProps({
  name: { type: String, required: true },
  label: { type: String, default: 'list' },
  width: { type: Number, default: 320 },
})
const state = reactive(readPanel(props.name, props.width))
watch(state, () => writePanel(props.name, state))

const maxWidth = () => Math.max(260, Math.floor(window.innerWidth * 0.6))
function drag(e) {
  if (e.button !== 0) return
  e.preventDefault()
  const x0 = e.clientX
  const w0 = state.width
  document.body.style.userSelect = 'none'
  const move = (ev) => { state.width = clampWidth(w0 + ev.clientX - x0, maxWidth()) }
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); document.body.style.userSelect = '' }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}
function key(e) {
  if (e.key === 'ArrowLeft') state.width = clampWidth(state.width - 20, maxWidth())
  else if (e.key === 'ArrowRight') state.width = clampWidth(state.width + 20, maxWidth())
}
</script>

<template>
  <div v-if="state.hidden" class="shrink-0 -ml-1">
    <button class="p-1.5 rounded-md border hover:bg-accent" :title="`Show the ${label}`" :aria-label="`Show the ${label}`" @click="state.hidden = false"><PanelLeftOpen class="w-4 h-4" /></button>
  </div>
  <template v-else>
    <aside class="shrink-0 min-w-0 space-y-2" :style="{ width: `${state.width}px` }" :aria-label="label">
      <slot />
    </aside>
    <div class="shrink-0 -mx-2 w-4 flex flex-col items-center self-stretch">
      <button class="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground" :title="`Hide the ${label}`" :aria-label="`Hide the ${label}`" @click="state.hidden = true"><PanelLeftClose class="w-4 h-4" /></button>
      <div
        role="separator" aria-orientation="vertical" tabindex="0" :aria-valuenow="state.width" :aria-label="`Resize the ${label}`"
        title="Drag to resize, double-click to reset"
        class="group flex-1 w-full cursor-col-resize flex justify-center focus:outline-none"
        @pointerdown="drag" @dblclick="state.width = width" @keydown="key"
      ><div class="w-px h-full bg-border group-hover:bg-ring group-focus:bg-ring" /></div>
    </div>
  </template>
</template>
