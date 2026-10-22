<script setup>
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Settings } from 'lucide-vue-next'
import ConnectionMenu from '../components/ConnectionMenu.vue'
import FeedbackModal from '../components/feedback/FeedbackModal.vue'
import { NAV } from './router.js'
import { useOrg, loadOrgs } from './useOrg.js'

const org = useOrg()
const route = useRoute()
const feedback = ref(false)
onMounted(loadOrgs)
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <header class="flex flex-wrap items-center gap-3 border-b px-4 py-2 bg-card">
      <h1 class="font-semibold text-base mr-4">Data Cloud Inspector</h1>
      <nav class="flex gap-1">
        <RouterLink
          v-for="item in NAV" :key="item.path" :to="item.path"
          class="px-3 py-1 rounded-md text-sm hover:bg-accent"
          active-class="bg-accent font-medium"
        >{{ item.label }}</RouterLink>
      </nav>
      <div class="ml-auto flex items-center gap-2 text-sm">
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
    <div v-else-if="org.error" class="m-4 p-3 rounded-md border border-destructive text-sm">
      Could not reach the org: {{ org.error }}
    </div>

    <main class="flex-1 p-4">
      <RouterView />
    </main>
    <FeedbackModal v-if="feedback" :screen="route.path" @close="feedback = false" />
  </div>
</template>
