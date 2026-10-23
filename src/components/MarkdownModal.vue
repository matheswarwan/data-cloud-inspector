<script setup>
// Shows a Markdown export with Copy and Download (View as Markdown in the Download menu).
import { ref } from 'vue'
import { X } from 'lucide-vue-next'
import { saveBlob } from '../lib/exportDoc.js'

const props = defineProps({ title: { type: String, default: '' }, text: { type: String, default: '' }, fileBase: { type: String, default: 'export' } })
const emit = defineEmits(['close'])
const copied = ref(false)
async function copy() { await navigator.clipboard.writeText(props.text); copied.value = true; setTimeout(() => { copied.value = false }, 1500) }
function download() { saveBlob(new Blob([props.text], { type: 'text/markdown;charset=utf-8' }), `${props.fileBase}.md`) }
</script>

<template>
  <div class="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" @mousedown.self="emit('close')" @keydown.esc="emit('close')">
    <div class="w-full max-w-4xl max-h-[85vh] flex flex-col rounded-md border bg-card shadow-2xl" role="dialog" aria-modal="true" :aria-label="title">
      <div class="px-4 py-3 border-b flex items-center gap-2">
        <h2 class="font-medium truncate">{{ title }}</h2>
        <button class="ml-auto px-2.5 py-1 rounded-md border text-sm hover:bg-accent" @click="copy">{{ copied ? 'Copied' : 'Copy' }}</button>
        <button class="px-2.5 py-1 rounded-md border text-sm hover:bg-accent" @click="download">Download .md</button>
        <button class="p-1 rounded hover:bg-accent" aria-label="Close" @click="emit('close')"><X class="w-4 h-4" /></button>
      </div>
      <pre class="flex-1 overflow-auto p-4 text-xs font-mono whitespace-pre-wrap break-words">{{ text }}</pre>
    </div>
  </div>
</template>
