<script setup>
// Home (feedback #106, #108): whether the org is connected and as whom, a short read-only
// promise, the most used pages, recent queries, and every section with what it does.
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { ShieldCheck, Plug, ArrowRight } from 'lucide-vue-next'
import { useOrg, currentOrg, loadOrgs } from '../app/useOrg.js'
import SavedOrgs from '../components/SavedOrgs.vue'
import { useCatalog, ensureCatalog } from '../app/useCatalog.js'
import { useQueries, loadQueries } from '../app/useQueries.js'
import { NAV } from '../app/router.js'
import { HELP } from '../lib/help.js'
import { topVisits } from '../lib/visits.js'

const router = useRouter()
const org = useOrg()
const catalog = useCatalog()
const queries = useQueries()
onMounted(() => { ensureCatalog(); loadQueries(); document.addEventListener('visibilitychange', onVisible) })
onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisible))
// Back from logging in to an org in another tab: look for its session again (feedback #109).
function onVisible() { if (document.visibilityState === 'visible' && !connected.value && !org.loading) loadOrgs() }

const host = computed(() => currentOrg()?.host || '')
const connected = computed(() => !!org.orgId && !!org.version && !org.problem)
const counts = computed(() => {
  const c = { DMO: 0, DLO: 0, CI: 0 }
  for (const o of catalog.objects) c[o.kind] = (c[o.kind] || 0) + 1
  return c
})

// Help text per sidebar page (the help topic is the page path without its slash).
const TOPIC = { '/objects': 'objects', '/sql': 'sql', '/sql/builder': 'builder', '/bulk': 'bulk', '/profile': 'profile', '/streams': 'streams', '/models': 'models', '/identity': 'identity', '/graphs': 'graphs', '/segments': 'segments', '/activations': 'activations', '/insights': 'insights', '/personalization': 'personalization', '/compare': 'compare', '/explore': 'explore', '/health': 'health', '/connection': 'connection' }
const pages = NAV.filter((n) => n.path !== '/')
const byPath = new Map(pages.map((n) => [n.path, n]))
const most = computed(() => topVisits(6).filter((v) => byPath.has(v.path)).map((v) => ({ ...byPath.get(v.path), n: v.n })))
// Until something has been used, suggest where people usually start.
const starters = ['/profile', '/sql', '/objects', '/segments', '/health', '/models'].map((p) => byPath.get(p)).filter(Boolean)
const groups = computed(() => {
  const out = new Map()
  for (const n of pages) (out.get(n.group) || out.set(n.group, []).get(n.group)).push(n)
  return [...out.values()]
})
const recent = computed(() => queries.history.slice(0, 4))
const short = (sql) => sql.replace(/\s+/g, ' ').slice(0, 120)
</script>

<template>
  <section class="max-w-6xl mx-auto space-y-5 pb-10">
    <div class="grid lg:grid-cols-[3fr_2fr] gap-4 items-stretch">
      <div class="border rounded-md bg-card p-4 space-y-2">
        <div class="flex items-center gap-2">
          <span :class="['w-2.5 h-2.5 rounded-full', connected ? 'bg-green-600' : org.loading ? 'bg-sky-500 animate-pulse' : 'bg-amber-500']" />
          <h2 class="font-semibold">{{ connected ? 'Connected' : org.loading ? 'Connecting…' : org.orgId ? 'Connected, with a problem' : 'Not connected' }}</h2>
        </div>
        <template v-if="org.orgId">
          <div class="text-sm"><span class="font-mono">{{ host }}</span> <span class="text-muted-foreground">API v{{ org.version }}{{ org.dataSpace ? `, data space ${org.dataSpace}` : '' }}</span></div>
          <div v-if="org.user" class="text-sm text-muted-foreground">Signed in as {{ org.user.name }} ({{ org.user.username }})</div>
          <p v-if="org.problem" class="text-sm text-destructive">{{ org.problem.message }}</p>
          <div v-if="catalog.objects.length" class="text-sm text-muted-foreground">{{ counts.DMO }} data model objects, {{ counts.DLO }} data lake objects, {{ counts.CI }} calculated insights.</div>
        </template>
        <p v-else class="text-sm text-muted-foreground">Log in to a Salesforce org with Data Cloud in this browser, then open this page again. The connection menu (top right) lists every org you are logged in to.</p>
        <RouterLink to="/connection" class="inline-flex items-center gap-1.5 text-sm text-link hover:underline"><Plug class="w-3.5 h-3.5" /> Connection check</RouterLink>
      </div>
      <div class="border rounded-md bg-card p-4 text-sm space-y-1.5">
        <div class="flex items-center gap-2 font-medium"><ShieldCheck class="w-4 h-4 text-green-600" /> Read only, and private</div>
        <ul class="text-muted-foreground space-y-1 list-disc pl-5">
          <li>Nothing is ever changed in your org: the tool only reads, and its SQL queries only read too.</li>
          <li>It uses the Salesforce login already in this browser. The session stays inside the extension and is sent only to your own org; nothing goes to any other server.</li>
          <li>Settings, saved queries and the metadata cache are kept in this browser. Records are not stored.</li>
        </ul>
      </div>
    </div>

    <SavedOrgs v-if="!connected && !org.loading" />

    <div class="space-y-2">
      <h3 class="font-medium">{{ most.length ? 'Most used' : 'Good places to start' }}</h3>
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <RouterLink v-for="n in (most.length ? most : starters)" :key="n.path" :to="n.path" class="group border rounded-md bg-card p-3 hover:bg-accent">
          <div class="flex items-center gap-2 font-medium text-sm">{{ n.label }}<span v-if="n.n" class="text-xs text-muted-foreground font-normal">{{ n.n }} {{ n.n === 1 ? 'visit' : 'visits' }}</span><ArrowRight class="w-3.5 h-3.5 ml-auto opacity-0 group-hover:opacity-100" /></div>
          <p class="text-xs text-muted-foreground line-clamp-2">{{ HELP[TOPIC[n.path]]?.text }}</p>
        </RouterLink>
      </div>
    </div>

    <SavedOrgs v-if="connected" />

    <div v-if="recent.length" class="space-y-2">
      <h3 class="font-medium">Recent queries</h3>
      <ul class="border rounded-md bg-card divide-y text-sm">
        <li v-for="h in recent" :key="h.at">
          <button class="w-full text-left px-3 py-2 hover:bg-accent" @click="router.push({ path: '/sql', query: { sql: h.sql } })">
            <div class="font-mono text-xs truncate">{{ short(h.sql) }}</div>
            <div class="text-xs text-muted-foreground">{{ new Date(h.at).toLocaleString() }} · {{ h.error ? 'failed' : `${(h.rows ?? 0).toLocaleString()} rows` }}</div>
          </button>
        </li>
      </ul>
    </div>

    <div class="space-y-2">
      <div class="flex items-baseline gap-2"><h3 class="font-medium">Everything in the tool</h3><RouterLink to="/help" class="text-xs text-link hover:underline">Help</RouterLink></div>
      <div class="grid md:grid-cols-2 xl:grid-cols-3 gap-3 items-start">
        <div v-for="(g, i) in groups" :key="i" class="border rounded-md bg-card divide-y">
          <RouterLink v-for="n in g" :key="n.path" :to="n.path" class="block px-3 py-2 hover:bg-accent">
            <div class="text-sm">{{ n.label }}</div>
            <p class="text-xs text-muted-foreground line-clamp-2">{{ HELP[TOPIC[n.path]]?.text }}</p>
          </RouterLink>
        </div>
      </div>
    </div>
  </section>
</template>
