<script setup>
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Settings, Search, ChevronDown } from 'lucide-vue-next'
import ConnectionMenu from '../components/ConnectionMenu.vue'
import FeedbackModal from '../components/feedback/FeedbackModal.vue'
import CommandPalette from '../components/CommandPalette.vue'
import DialogHost from '../components/DialogHost.vue'
import { NAV } from './router.js'
import { useOrg, loadOrgs } from './useOrg.js'
import { jobBadge } from './useJobs.js'

const org = useOrg()
const route = useRoute()
const feedback = ref(false)
const palette = ref(null)
const mainNav = NAV.filter((n) => !n.more)
const moreNav = NAV.filter((n) => n.more)
const moreOpen = ref(false)
const moreBadge = () => (moreNav.some((n) => n.job && jobBadge(n.job) === 'running') ? 'running' : moreNav.some((n) => n.job && jobBadge(n.job) === 'new') ? 'new' : '')
const inMore = () => moreNav.some((n) => route.path.startsWith(n.path))
onMounted(loadOrgs)
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <header class="flex flex-wrap items-center gap-2 border-b px-4 py-2 bg-card">
      <h1 class="font-semibold text-base mr-2 whitespace-nowrap">Data Cloud Inspector</h1>
      <nav class="flex gap-0.5">
        <RouterLink
          v-for="item in mainNav" :key="item.path" :to="item.path"
          class="px-2 py-1 rounded-md text-sm hover:bg-accent whitespace-nowrap"
          active-class="bg-accent font-medium"
        >{{ item.label }}<span
            v-if="item.job && jobBadge(item.job)"
            :class="['inline-block w-1.5 h-1.5 rounded-full ml-1 align-middle', jobBadge(item.job) === 'running' ? 'bg-sky-500 animate-pulse' : 'bg-amber-500']"
            :title="jobBadge(item.job) === 'running' ? 'Running in the background' : 'Finished: results waiting'"
          /></RouterLink>
        <div class="relative" @mouseleave="moreOpen = false">
          <button :class="['px-2 py-1 rounded-md text-sm hover:bg-accent inline-flex items-center gap-0.5', inMore() ? 'bg-accent font-medium' : '']" :aria-expanded="moreOpen" @click="moreOpen = !moreOpen">
            More<ChevronDown class="w-3.5 h-3.5" /><span v-if="moreBadge()" :class="['inline-block w-1.5 h-1.5 rounded-full ml-1', moreBadge() === 'running' ? 'bg-sky-500 animate-pulse' : 'bg-amber-500']" />
          </button>
          <div v-if="moreOpen" class="absolute left-0 top-full z-40 w-48 rounded-md border bg-card shadow-lg py-1">
            <RouterLink v-for="item in moreNav" :key="item.path" :to="item.path" class="flex items-center px-3 py-1.5 text-sm hover:bg-accent" active-class="font-medium" @click="moreOpen = false">
              {{ item.label }}<span v-if="item.job && jobBadge(item.job)" :class="['inline-block w-1.5 h-1.5 rounded-full ml-auto', jobBadge(item.job) === 'running' ? 'bg-sky-500 animate-pulse' : 'bg-amber-500']" />
            </RouterLink>
          </div>
        </div>
      </nav>
      <div class="ml-auto flex items-center gap-2 text-sm">
        <button class="p-1.5 rounded-md hover:bg-accent" title="Search everything (Ctrl+K or Cmd+K)" aria-label="Search" @click="palette?.show()"><Search class="w-4 h-4" /></button>
        <ConnectionMenu />
        <RouterLink to="/settings" class="p-1.5 rounded-md hover:bg-accent" active-class="bg-accent" title="Settings"><Settings class="w-4 h-4" /></RouterLink>
        <button class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border hover:bg-accent" title="Report a problem or send an idea" @click="feedback = true">
          Feedback
        </button>
      </div>
    </header>

    <div v-if="!org.loading && !org.orgs.length" class="m-4 p-4 rounded-md border bg-card text-sm">
      No Salesforce session found. Log in to your org (the one with Data Cloud) in this browser,
      then choose Find orgs again in the connection menu (top right). Data Cloud Inspector uses that login and only reads.
    </div>
    <div v-else-if="org.problem" class="m-4 p-3 rounded-md border border-amber-400 bg-card text-sm">
      {{ org.problem.message }}
      <RouterLink v-if="org.problem.kind === 'rejected'" to="/settings" class="text-link hover:underline ml-1">Open Settings</RouterLink>
    </div>
    <div v-else-if="org.error" class="m-4 p-3 rounded-md border border-destructive text-sm">
      Could not reach the org: {{ org.error }}
    </div>

    <main class="flex-1 p-4">
      <RouterView />
    </main>
    <CommandPalette ref="palette" />
    <DialogHost />
    <FeedbackModal v-if="feedback" :screen="route.path" @close="feedback = false" />
  </div>
</template>
