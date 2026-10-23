<script setup>
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Settings, Search } from 'lucide-vue-next'
import ConnectionMenu from '../components/ConnectionMenu.vue'
import FeedbackModal from '../components/feedback/FeedbackModal.vue'
import CommandPalette from '../components/CommandPalette.vue'
import { NAV } from './router.js'
import { useOrg, loadOrgs } from './useOrg.js'

const org = useOrg()
const route = useRoute()
const feedback = ref(false)
const palette = ref(null)
onMounted(loadOrgs)
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <header class="flex flex-wrap items-center gap-2 border-b px-4 py-2 bg-card">
      <h1 class="font-semibold text-base mr-2 whitespace-nowrap">Data Cloud Inspector</h1>
      <nav class="flex gap-0.5">
        <RouterLink
          v-for="item in NAV" :key="item.path" :to="item.path"
          class="px-2 py-1 rounded-md text-sm hover:bg-accent whitespace-nowrap"
          active-class="bg-accent font-medium"
        >{{ item.label }}</RouterLink>
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
    <FeedbackModal v-if="feedback" :screen="route.path" @close="feedback = false" />
  </div>
</template>
