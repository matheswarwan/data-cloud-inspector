<script setup>
// A drag handle between two panes (feedback #124). `vertical` is a column divider (drag
// left and right), otherwise a row divider. v-model is the size in px of the pane the handle
// belongs to; `invert` when that pane is after the handle (right or below), so dragging
// towards it makes it smaller. Double-click resets, arrow keys move 20 px.
import { clampSize } from '../lib/builderLayout.js'

const props = defineProps({
  modelValue: { type: Number, default: 0 },
  min: { type: Number, default: 60 },
  max: { type: Number, default: 2000 },
  vertical: { type: Boolean, default: false },
  invert: { type: Boolean, default: false },
  label: { type: String, default: 'Resize' },
})
const emit = defineEmits(['update:modelValue', 'reset'])

const set = (v) => emit('update:modelValue', clampSize(v, props))
function drag(e) {
  if (e.button !== 0) return
  e.preventDefault()
  const p0 = props.vertical ? e.clientX : e.clientY
  const s0 = props.modelValue
  document.body.style.userSelect = 'none'
  const move = (ev) => {
    const d = (props.vertical ? ev.clientX : ev.clientY) - p0
    set(s0 + (props.invert ? -d : d))
  }
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); document.body.style.userSelect = '' }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}
function key(e) {
  const grow = props.vertical ? ['ArrowRight', 'ArrowLeft'] : ['ArrowDown', 'ArrowUp']
  const i = grow.indexOf(e.key)
  if (i < 0) return
  e.preventDefault()
  const d = (i === 0 ? 20 : -20) * (props.invert ? -1 : 1)
  set(props.modelValue + d)
}
</script>

<template>
  <div
    role="separator" tabindex="0" :aria-orientation="vertical ? 'vertical' : 'horizontal'" :aria-valuenow="modelValue" :aria-label="label"
    title="Drag to resize, double-click to reset"
    :class="['group shrink-0 flex justify-center items-center focus:outline-none', vertical ? 'w-3 -mx-1.5 self-stretch cursor-col-resize' : 'h-3 -my-1.5 w-full cursor-row-resize flex-col']"
    @pointerdown="drag" @dblclick="emit('reset')" @keydown="key"
  ><div :class="['bg-border group-hover:bg-ring group-focus:bg-ring', vertical ? 'w-px h-full' : 'h-px w-full']" /></div>
</template>
