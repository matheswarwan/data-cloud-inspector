<script setup>
import { onMounted, ref, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Search, Loader2 } from 'lucide-vue-next'
import AppSidebar from '../components/AppSidebar.vue'
import ConnectionMenu from '../components/ConnectionMenu.vue'
import FeedbackModal from '../components/feedback/FeedbackModal.vue'
import CommandPalette from '../components/CommandPalette.vue'
import DialogHost from '../components/DialogHost.vue'
import FeatureTips from '../components/FeatureTips.vue'
import ApiConsole from '../components/ApiConsole.vue'
import { useApiConsole } from './useApiConsole.js'
import { useActivity, useActivityText } from './useActivity.js'
import { usePreload } from './usePreload.js'
import { NAV } from './router.js'
import { recordVisit } from '../lib/visits.js'
import { useOrg, loadOrgs, orgName } from './useOrg.js'

const org = useOrg()
const route = useRoute()
// Pages opened, for Home's Most used (feedback #106).
const NAV_PATHS = NAV.map((n) => n.path)
useRouter().afterEach((to) => recordVisit(to.path, NAV_PATHS))
const apiConsoleOn = useApiConsole().enabled
const busy = useActivity()
const busyText = useActivityText()
const feedback = ref(false)
const palette = ref(null)
onMounted(loadOrgs)
usePreload()
// Each app tab keeps its own org (feedback #144): the browser tab says which one
watchEffect(() => { document.title = org.orgId ? `${orgName(org.orgId)} · Data Cloud Inspector` : 'Data Cloud Inspector' })
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <header class="sticky top-0 z-30 h-[49px] flex items-center gap-2 border-b px-4 bg-card">
      <h1 class="flex items-center gap-2.5 font-semibold text-base mr-2 whitespace-nowrap"><img src="/images/ateko-mark.svg" alt="Ateko" class="h-[22px] w-auto dark:invert" />Data Cloud Inspector</h1>
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
    <div v-if="!org.loading && !org.orgs.length" class="m-4 p-4 rounded-xl border bg-card text-sm">
      No Salesforce session found. Log in to your org (the one with Data Cloud) in this browser,
      then choose Find orgs again in the connection menu (top right). Data Cloud Inspector uses that login and only reads.
    </div>
    <div v-else-if="org.problem" class="m-4 p-3 rounded-xl border border-amber-400 bg-card text-sm">
      {{ org.problem.message }}
      <RouterLink v-if="org.problem.kind === 'rejected'" to="/settings" class="text-link hover:underline ml-1">Open Settings</RouterLink>
    </div>
    <div v-else-if="org.error" class="m-4 p-3 rounded-md border border-destructive text-sm">
      Could not reach the org: {{ org.error }}
    </div>

    <main :class="['flex-1 p-4 lg:px-8 lg:py-7 min-w-0', apiConsoleOn ? 'pb-12' : '']">
      <RouterView />
    </main>
    </div>
    </div>
    <!-- Loading from Salesforce: a small spinner and what is loading, bottom right (feedback). -->
    <div
      v-if="busy" :class="['fixed right-4 z-30 flex items-center gap-2 max-w-[min(28rem,60vw)] rounded-full border bg-card/95 pl-2 pr-3 py-1 text-xs text-muted-foreground shadow-md', apiConsoleOn ? 'bottom-14' : 'bottom-4']"
      role="status" aria-live="polite" :title="busyText ? `Loading ${busyText}` : 'Loading from Salesforce'"
    ><Loader2 class="w-3.5 h-3.5 shrink-0 animate-spin text-primary" aria-hidden="true" /><span class="truncate">{{ busyText ? `Loading ${busyText}` : 'Loading' }}</span></div>
    <CommandPalette ref="palette" />
    <DialogHost />
    <FeatureTips />
    <ApiConsole />
    <FeedbackModal v-if="feedback" :screen="route.path" @close="feedback = false" />
  </div>
</template>
