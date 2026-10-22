<script setup>
import { onMounted } from 'vue'
import { RefreshCw } from 'lucide-vue-next'
import { NAV } from './router.js'
import { useOrg, loadOrgs, selectOrg } from './useOrg.js'

const org = useOrg()
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
        <label for="org" class="text-muted-foreground">Org</label>
        <select
          id="org" class="border rounded-md px-2 py-1 bg-background min-w-64"
          :value="org.orgId" :disabled="!org.orgs.length"
          @change="selectOrg($event.target.value)"
        >
          <option v-if="!org.orgs.length" :value="null">No logged-in org found</option>
          <option v-for="o in org.orgs" :key="o.orgId" :value="o.orgId">{{ o.host }}</option>
        </select>
        <span v-if="org.version" class="text-muted-foreground">API v{{ org.version }}</span>
        <button class="p-1.5 rounded-md hover:bg-accent" title="Find logged-in orgs again" @click="loadOrgs">
          <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': org.loading }" />
        </button>
      </div>
    </header>

    <div v-if="!org.loading && !org.orgs.length" class="m-4 p-4 rounded-md border bg-card text-sm">
      No Salesforce session found. Log in to your org (the one with Data Cloud) in this browser,
      then click the refresh button. Data Cloud Inspector uses that login and only reads.
    </div>
    <div v-else-if="org.error" class="m-4 p-3 rounded-md border border-destructive text-sm">
      Could not reach the org: {{ org.error }}
    </div>

    <main class="flex-1 p-4">
      <RouterView />
    </main>
  </div>
</template>
