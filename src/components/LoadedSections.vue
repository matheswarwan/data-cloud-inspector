<script setup>
// What has been read from the org, section by section, with Load everything and Refresh
// (feedback #1002). In the connection menu and on Home (feedback #1017).
import { computed } from 'vue'
import { Check, RefreshCw, Loader2, X, Circle, DownloadCloud } from 'lucide-vue-next'
import { preloadState, loadEverything } from '../app/usePreload.js'
import { preloadProgress } from '../lib/preload.js'

const progress = computed(() => preloadProgress(preloadState.steps))
const loadedOnce = computed(() => progress.value.finished > 0 || preloadState.running)
const seconds = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : ms != null ? `${ms} ms` : '')
</script>

<template>
  <div>
    <div class="flex items-center gap-2 text-xs text-muted-foreground">
      <span class="flex-1">{{ preloadState.running ? `Loading ${progress.finished + 1} of ${progress.total}` : loadedOnce ? `Loaded ${progress.finished - progress.failed} of ${progress.total}${progress.failed ? `, ${progress.failed} failed` : ''}` : 'Sections not loaded yet' }}</span>
      <button class="px-2 py-1 rounded border hover:bg-accent text-foreground inline-flex items-center gap-1 disabled:opacity-50" :disabled="preloadState.running" title="Read every section now, using what is already cached" @click="loadEverything()"><DownloadCloud class="w-3.5 h-3.5" /> Load everything</button>
      <button class="px-2 py-1 rounded border hover:bg-accent text-foreground inline-flex items-center gap-1 disabled:opacity-50" :disabled="preloadState.running" title="Read every section again from the org and run Health again" @click="loadEverything({ refresh: true })"><RefreshCw class="w-3.5 h-3.5" /> Refresh</button>
    </div>
    <div v-if="loadedOnce" class="mt-2 h-1 rounded bg-muted overflow-hidden" role="progressbar" :aria-valuenow="progress.finished" :aria-valuemax="progress.total">
      <div class="h-full bg-primary transition-all" :style="{ width: `${(100 * progress.finished) / progress.total}%` }" />
    </div>
    <ul v-if="loadedOnce" class="mt-2 space-y-1 text-xs">
      <li v-for="s in preloadState.steps" :key="s.id" class="flex items-start gap-2">
        <Loader2 v-if="s.status === 'running'" class="w-3.5 h-3.5 mt-px shrink-0 animate-spin text-sky-500" />
        <Check v-else-if="s.status === 'done'" class="w-3.5 h-3.5 mt-px shrink-0 text-green-600" />
        <X v-else-if="s.status === 'failed'" class="w-3.5 h-3.5 mt-px shrink-0 text-destructive" />
        <Circle v-else class="w-3.5 h-3.5 mt-px shrink-0 text-muted-foreground/50" />
        <span class="min-w-0 flex-1">
          <span :class="s.status === 'pending' ? 'text-muted-foreground' : ''">{{ s.label }}</span>
          <span v-if="s.detail" class="text-muted-foreground">: {{ s.detail }}</span>
          <span v-if="s.error" class="block text-destructive break-words">{{ s.error }}</span>
        </span>
        <span v-if="s.status === 'done' || s.status === 'failed'" class="text-muted-foreground shrink-0">{{ seconds(s.ms) }}</span>
      </li>
    </ul>
  </div>
</template>
