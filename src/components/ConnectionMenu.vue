<script setup>
// Top-bar connection pill and menu, as in Marketing Cloud Toolkit (feedback #83): the org in
// use with a status dot, the other logged-in orgs, Find orgs again, and the connection check.
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronDown, Check, RefreshCw, Stethoscope } from 'lucide-vue-next'
import { useOrg, loadOrgs, selectOrg, currentOrg } from '../app/useOrg.js'

const org = useOrg()
const router = useRouter()
const open = ref(false)
const root = ref(null)

const status = computed(() => {
  if (org.loading) return { dot: 'bg-amber-400', text: 'Looking for orgs…' }
  if (!org.orgs.length) return { dot: 'bg-red-500', text: 'Not connected' }
  if (org.error) return { dot: 'bg-red-500', text: currentOrg()?.host || 'Not connected' }
  if (!org.version) return { dot: 'bg-amber-400', text: currentOrg()?.host || 'Connecting…' }
  return { dot: 'bg-green-500', text: currentOrg()?.host }
})

function pick(orgId) {
  selectOrg(orgId)
  open.value = false
}

function check() {
  open.value = false
  router.push('/connection')
}

const onDoc = (e) => { if (open.value && root.value && !root.value.contains(e.target)) open.value = false }
const onKey = (e) => { if (e.key === 'Escape') open.value = false }
onMounted(() => { document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey) })
onUnmounted(() => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) })
</script>

<template>
  <div ref="root" class="relative">
    <button
      class="inline-flex items-center gap-2 px-3 py-1 rounded-full border text-sm hover:bg-accent max-w-80"
      :aria-expanded="open" title="Connection" @click="open = !open"
    >
      <span :class="['w-2 h-2 rounded-full shrink-0', status.dot]" />
      <span class="truncate">{{ status.text }}</span>
      <span v-if="org.version" class="text-muted-foreground text-xs shrink-0">v{{ org.version }}</span>
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
        <span class="truncate">{{ o.host }}</span>
        <span class="ml-auto font-mono text-xs text-muted-foreground">{{ o.orgId }}</span>
      </button>
      <p v-if="org.error" class="px-3 py-1 text-xs text-destructive">{{ org.error }}</p>
      <div class="border-t mt-1 p-1 flex flex-col">
        <button class="px-2 py-1.5 rounded flex items-center gap-2 hover:bg-accent" @click="loadOrgs()">
          <RefreshCw :class="['w-4 h-4', { 'animate-spin': org.loading }]" /> Find orgs again
        </button>
        <button class="px-2 py-1.5 rounded flex items-center gap-2 hover:bg-accent" @click="check">
          <Stethoscope class="w-4 h-4" /> Run the connection check
        </button>
      </div>
    </div>
  </div>
</template>
