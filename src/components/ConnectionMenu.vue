<script setup>
// Top-bar connection pill and menu, as in Marketing Cloud Toolkit (feedback #83): the org in
// use with a status dot, the other logged-in orgs, Find orgs again, and the connection check.
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronDown, Check, RefreshCw, Loader2, X, Circle, DownloadCloud } from 'lucide-vue-next'
import { preloadState, loadEverything } from '../app/usePreload.js'
import { preloadProgress } from '../lib/preload.js'
import { useOrg, loadOrgs, selectOrg, currentOrg, selectDataSpace, orgName } from '../app/useOrg.js'

const org = useOrg()
const router = useRouter()
const open = ref(false)
const root = ref(null)

const status = computed(() => {
  if (org.loading) return { dot: 'bg-amber-400', text: 'Looking for orgs…' }
  if (!org.orgs.length) return { dot: 'bg-red-500', text: 'Not connected' }
  const name = currentOrg() ? orgName(org.orgId) : ''
  if (org.error || org.problem?.kind === 'rejected' || org.problem?.kind === 'logged-out') return { dot: 'bg-red-500', text: name || 'Not connected' }
  if (org.problem) return { dot: 'bg-amber-400', text: name }
  if (!org.version) return { dot: 'bg-amber-400', text: name || 'Connecting…' }
  return { dot: 'bg-green-500', text: name }
})

function pick(orgId) {
  selectOrg(orgId)
  open.value = false
}

function check() {
  open.value = false
  router.push('/connection')
}

// Load everything (feedback #1002): what has been read for this org, step by step.
const progress = computed(() => preloadProgress(preloadState.steps))
const loadedOnce = computed(() => progress.value.finished > 0 || preloadState.running)
const seconds = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : ms != null ? `${ms} ms` : '')

const onDoc = (e) => { if (open.value && root.value && !root.value.contains(e.target)) open.value = false }
const onKey = (e) => { if (e.key === 'Escape') open.value = false }
onMounted(() => { document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey) })
onUnmounted(() => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) })
</script>

<template>
  <div ref="root" class="relative">
    <button
      class="inline-flex items-center gap-2 px-2.5 py-1 rounded-md border text-sm hover:bg-accent max-w-64"
      :aria-expanded="open" :title="currentOrg()?.host ? `Connection: ${currentOrg().host}` : 'Connection'" @click="open = !open"
    >
      <span :class="['w-2 h-2 rounded-full shrink-0', status.dot]" />
      <span class="truncate">{{ status.text }}</span>
      <span v-if="org.dataSpaces.length > 1" class="text-xs shrink-0 border rounded px-1">{{ org.dataSpace }}</span>
      <span v-if="org.version" class="text-muted-foreground text-xs shrink-0">v{{ org.version }}</span>
      <Loader2 v-if="preloadState.running" class="w-3.5 h-3.5 shrink-0 animate-spin text-muted-foreground" :title="`Loading: ${progress.finished} of ${progress.total}`" />
      <ChevronDown class="w-3.5 h-3.5 shrink-0" />
    </button>
    <div v-if="open" class="absolute right-0 mt-1 w-96 rounded-md border bg-card shadow-lg z-40 text-sm">
      <div v-if="org.user" class="px-3 pt-3 pb-2 border-b">
        <div class="text-xs text-muted-foreground">Signed in as</div>
        <div class="truncate">{{ org.user.name }}</div>
        <div class="text-xs text-muted-foreground truncate">{{ org.user.username }}</div>
      </div>
      <div class="px-3 pt-3 pb-1 text-xs text-muted-foreground">Logged-in orgs in this browser</div>
      <p v-if="!org.orgs.length" class="px-3 pb-2 text-muted-foreground">
        None found. Log in to your org (the one with Data Cloud) in this browser, then Find orgs again.
      </p>
      <button
        v-for="o in org.orgs" :key="o.orgId"
        class="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-accent" @click="pick(o.orgId)"
      >
        <Check :class="['w-4 h-4 shrink-0', o.orgId === org.orgId ? '' : 'invisible']" />
        <span class="min-w-0"><span class="block truncate">{{ orgName(o.orgId) }}</span><span v-if="orgName(o.orgId) !== o.host" class="block truncate text-xs text-muted-foreground">{{ o.host }}</span></span>
        <span class="ml-auto font-mono text-xs text-muted-foreground">{{ o.orgId }}</span>
      </button>
      <template v-if="org.dataSpaces.length">
        <div class="px-3 pt-3 pb-1 text-xs text-muted-foreground border-t mt-1">Data space</div>
        <button
          v-for="d in org.dataSpaces" :key="d.name"
          class="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-accent" @click="selectDataSpace(d.name); open = false"
        >
          <Check :class="['w-4 h-4 shrink-0', d.name === org.dataSpace ? '' : 'invisible']" />
          <span class="truncate">{{ d.label }}</span>
          <span v-if="d.label !== d.name" class="font-mono text-xs text-muted-foreground">{{ d.name }}</span>
        </button>
      </template>
      <div v-if="org.version && !org.problem" class="border-t mt-1 px-3 pt-2 pb-2">
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
      <p v-if="org.error" class="px-3 py-1 text-xs text-destructive">{{ org.error }}</p>
      <p v-else-if="org.problem" class="px-3 py-1 text-xs">{{ org.problem.message }}</p>
      <div class="border-t mt-1 p-1 flex flex-col">
        <button class="px-2 py-1.5 rounded flex items-center gap-2 hover:bg-accent" @click="loadOrgs()">
          <RefreshCw :class="['w-4 h-4', { 'animate-spin': org.loading }]" /> Find orgs again
        </button>
        <button class="px-2 py-1.5 rounded flex items-center gap-2 hover:bg-accent" @click="check">
          Run the connection check
        </button>
      </div>
    </div>
  </div>
</template>
