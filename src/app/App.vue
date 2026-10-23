<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Search } from 'lucide-vue-next'
import AppSidebar from '../components/AppSidebar.vue'
import ConnectionMenu from '../components/ConnectionMenu.vue'
import FeedbackModal from '../components/feedback/FeedbackModal.vue'
import CommandPalette from '../components/CommandPalette.vue'
import DialogHost from '../components/DialogHost.vue'
import FeatureTips from '../components/FeatureTips.vue'
import { NAV } from './router.js'
import { recordVisit } from '../lib/visits.js'
import { useOrg, loadOrgs } from './useOrg.js'

const org = useOrg()
const route = useRoute()
// Pages opened, for Home's Most used (feedback #106).
const NAV_PATHS = NAV.map((n) => n.path)
useRouter().afterEach((to) => recordVisit(to.path, NAV_PATHS))
const feedback = ref(false)
const palette = ref(null)
onMounted(loadOrgs)
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <header class="sticky top-0 z-30 h-[49px] flex items-center gap-2 border-b px-4 bg-card">
      <h1 class="font-semibold text-base mr-2 whitespace-nowrap">Data Cloud Inspector</h1>
      <div class="ml-auto flex items-center gap-2 text-sm">
        <button class="p-1.5 rounded-md hover:bg-accent" title="Search everything (Ctrl+K or Cmd+K)" aria-label="Search" @click="palette?.show()"><Search class="w-4 h-4" /></button>
        <ConnectionMenu />
        <button class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border hover:bg-accent" title="Report a problem or send an idea" @click="feedback = true">
          Feedback
        </button>
      </div>
    </header>

    <div class="flex flex-1 min-h-0">
    <AppSidebar />
    <div class="flex-1 min-w-0 flex flex-col">
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

    <main class="flex-1 p-4 min-w-0">
      <RouterView />
    </main>
    </div>
    </div>
    <CommandPalette ref="palette" />
    <DialogHost />
    <FeatureTips />
    <FeedbackModal v-if="feedback" :screen="route.path" @close="feedback = false" />
  </div>
</template>
