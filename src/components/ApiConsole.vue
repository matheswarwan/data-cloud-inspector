<script setup>
// The API console drawer (feedback #115): at the bottom of the window while it is on in
// Settings. Click a call for its request body and response; Download as Markdown.
import { ref, computed } from 'vue'
import { ChevronUp, ChevronDown, X } from 'lucide-vue-next'
import JsonViewer from './JsonViewer.vue'
import { useApiConsole, setApiConsole, clearApiConsole, apiConsoleMarkdown } from '../app/useApiConsole.js'
import { saveBlob } from '../lib/exportDoc.js'

const { enabled, calls } = useApiConsole()
const open = ref(false)
const height = ref(260)
const picked = ref(null)
const filter = ref('')
const shown = computed(() => {
  const t = filter.value.trim().toLowerCase()
  return t ? calls.value.filter((c) => `${c.method} ${c.path} ${c.status}`.toLowerCase().includes(t)) : calls.value
})
const current = computed(() => calls.value.find((c) => c.id === picked.value) || null)
const time = (at) => new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const short = (p) => p.replace(/^\/services\/data\/v[\d.]+/, '')
const download = () => saveBlob(new Blob([apiConsoleMarkdown(shown.value)], { type: 'text/markdown' }), `dci-api-calls-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.md`)
function resize(e) {
  e.preventDefault()
  const y0 = e.clientY, h0 = height.value
  const move = (ev) => { height.value = Math.max(120, Math.min(window.innerHeight * 0.8, h0 + y0 - ev.clientY)) }
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
}
const METHOD = { GET: 'text-sky-700 dark:text-sky-400', POST: 'text-amber-700 dark:text-amber-400' }
</script>

<template>
  <div v-if="enabled" class="fixed bottom-0 left-0 right-0 z-30 border-t bg-card shadow-[0_-2px_8px_rgba(0,0,0,0.08)]" role="region" aria-label="API console">
    <div v-if="open" class="h-1.5 cursor-ns-resize hover:bg-ring/40" title="Drag to resize" @pointerdown="resize" />
    <div class="flex items-center gap-2 px-3 py-1 text-xs">
      <button class="flex items-center gap-1.5 font-medium" :aria-expanded="open" @click="open = !open">
        <component :is="open ? ChevronDown : ChevronUp" class="w-3.5 h-3.5" /> API console
        <span class="px-1.5 rounded-full bg-muted text-muted-foreground">{{ calls.length }}</span>
      </button>
      <span v-if="calls[0]" class="text-muted-foreground truncate font-mono">last: {{ calls[0].method }} {{ short(calls[0].path) }} · {{ calls[0].status || 'no response' }}</span>
      <span class="ml-auto flex items-center gap-2">
        <input v-if="open" v-model="filter" placeholder="Filter calls" class="border rounded px-1.5 py-0.5 bg-background w-40" />
        <button class="text-link hover:underline disabled:opacity-50" :disabled="!shown.length" @click="download">Download .md</button>
        <button class="text-link hover:underline" @click="clearApiConsole(); picked = null">Clear</button>
        <button class="p-0.5 rounded hover:bg-accent" title="Turn the API console off (Settings)" aria-label="Turn the API console off" @click="setApiConsole(false)"><X class="w-3.5 h-3.5" /></button>
      </span>
    </div>
    <div v-if="open" class="flex border-t min-h-0" :style="{ height: `${height}px` }">
      <ul class="w-[45%] min-w-0 overflow-auto font-mono text-[11px] border-r">
        <li v-if="!shown.length" class="p-3 text-muted-foreground font-sans">{{ calls.length ? 'No calls match.' : 'Calls appear here as pages load data.' }}</li>
        <li v-for="c in shown" :key="c.id">
          <button :class="['w-full text-left px-2 py-0.5 flex gap-2 hover:bg-accent', { 'bg-accent': c.id === picked }]" @click="picked = c.id">
            <span class="text-muted-foreground shrink-0">{{ time(c.at) }}</span>
            <span :class="['shrink-0 font-semibold', METHOD[c.method] || '']">{{ c.method }}</span>
            <span :class="['shrink-0', c.ok ? 'text-green-700 dark:text-green-400' : 'text-destructive']">{{ c.status || 'n/a' }}</span>
            <span class="truncate">{{ short(c.path) }}</span>
            <span class="ml-auto text-muted-foreground shrink-0">{{ c.ms }} ms</span>
          </button>
        </li>
      </ul>
      <div class="flex-1 min-w-0 overflow-auto p-2 space-y-2 text-xs">
        <p v-if="!current" class="text-muted-foreground">Pick a call to see its request and response.</p>
        <template v-else>
          <div class="font-mono break-all"><span class="font-semibold">{{ current.method }}</span> {{ current.path }}</div>
          <div class="text-muted-foreground">{{ new Date(current.at).toLocaleString() }} · {{ current.status || 'no response' }} · {{ current.ms }} ms</div>
          <div v-if="current.body != null"><div class="font-medium mb-1">Request body</div><JsonViewer :value="current.body" file-name="request" compact box-class="max-h-40" /></div>
          <p v-if="current.error" class="text-destructive whitespace-pre-wrap">{{ current.error }}</p>
          <div v-if="current.data !== undefined"><div class="font-medium mb-1">Response</div><JsonViewer :value="current.data" file-name="response" compact :open-depth="1" box-class="max-h-[50vh]" /></div>
        </template>
      </div>
    </div>
  </div>
</template>
