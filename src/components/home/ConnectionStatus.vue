<script setup>
// Whether the org is connected and as whom, with Log in buttons when it is not (Home, and its
// Session and setup menu).
import { ref, computed } from 'vue'
import { Plug, LogIn } from 'lucide-vue-next'
import { useOrg, currentOrg } from '../../app/useOrg.js'
import { useCatalog } from '../../app/useCatalog.js'

const org = useOrg()
const catalog = useCatalog()
const host = computed(() => currentOrg()?.host || '')
const connected = computed(() => !!org.orgId && !!org.version && !org.problem)
const counts = computed(() => {
  const c = { DMO: 0, DLO: 0, CI: 0 }
  for (const o of catalog.objects) c[o.kind] = (c[o.kind] || 0) + 1
  return c
})
// Log in to an org that is not in the saved list yet: production, sandbox or a My Domain.
const domain = ref('')
const domainUrl = computed(() => {
  const d = domain.value.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  if (!d) return ''
  return `https://${d.includes('.') ? d : `${d}.my.salesforce.com`}/`
})
const openLogin = (url) => url && window.open(url, '_blank', 'noopener')
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-center gap-2">
      <span :class="['w-2.5 h-2.5 rounded-full', connected ? 'bg-green-600' : org.loading ? 'bg-sky-500 animate-pulse' : 'bg-amber-500']" />
      <span class="font-semibold">{{ connected ? 'Connected' : org.loading ? 'Connecting…' : org.orgId ? 'Connected, with a problem' : 'Not connected' }}</span>
    </div>
    <template v-if="org.orgId">
      <div class="text-sm"><span class="font-mono">{{ host }}</span> <span class="text-muted-foreground">API v{{ org.version }}{{ org.dataSpace ? `, data space ${org.dataSpace}` : '' }}</span></div>
      <div v-if="org.user" class="text-sm text-muted-foreground">Signed in as {{ org.user.name }} ({{ org.user.username }})</div>
      <p v-if="org.problem" class="text-sm text-destructive">{{ org.problem.message }}</p>
      <div v-if="catalog.objects.length" class="text-sm text-muted-foreground">{{ counts.DMO }} data model objects, {{ counts.DLO }} data lake objects, {{ counts.CI }} calculated insights.</div>
    </template>
    <template v-if="!connected && !org.loading">
      <p class="text-sm text-muted-foreground">{{ org.orgId ? 'Log in again' : 'Log in' }} to a Salesforce org with Data Cloud in this browser. The login opens in a new tab; come back here afterwards and this page connects. If the org refuses the browser session, use Log in with OAuth in Session and setup.</p>
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <button class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary text-primary-foreground" @click="openLogin('https://login.salesforce.com/')"><LogIn class="w-3.5 h-3.5" /> Log in to production</button>
        <button class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border hover:bg-accent" @click="openLogin('https://test.salesforce.com/')"><LogIn class="w-3.5 h-3.5" /> Log in to a sandbox</button>
      </div>
      <form class="flex flex-wrap items-center gap-2 text-sm" @submit.prevent="openLogin(domainUrl)">
        <input v-model="domain" class="border rounded-md px-2 py-1 bg-background font-mono text-xs w-72 max-w-full" placeholder="My Domain, for example acme.my.salesforce.com" aria-label="My Domain" />
        <button type="submit" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border hover:bg-accent disabled:opacity-40" :disabled="!domainUrl"><LogIn class="w-3.5 h-3.5" /> Log in</button>
      </form>
    </template>
    <RouterLink to="/connection" class="inline-flex items-center gap-1.5 text-sm text-link hover:underline"><Plug class="w-3.5 h-3.5" /> Connection check</RouterLink>
  </div>
</template>
