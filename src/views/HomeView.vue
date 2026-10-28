<script setup>
// Home (feedback #106, #108): whether the org is connected and as whom, a short read-only
// promise, the most used pages, recent queries, and every section with what it does.
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { ShieldCheck, Plug, ArrowRight, LogIn } from 'lucide-vue-next'
import { useOrg, currentOrg, loadOrgs } from '../app/useOrg.js'
import SavedOrgs from '../components/SavedOrgs.vue'
import UserContext from '../components/UserContext.vue'
import LoadedSections from '../components/LoadedSections.vue'
import OAuthLogin from '../components/OAuthLogin.vue'
import HomeSection from '../components/HomeSection.vue'
import { readLayout, writeLayout, moveSection } from '../lib/homeLayout.js'
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

// Log in to an org that is not in the saved list yet: production, sandbox or a My Domain.
const domain = ref('')
const domainUrl = computed(() => {
  const d = domain.value.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  if (!d) return ''
  return `https://${d.includes('.') ? d : `${d}.my.salesforce.com`}/`
})
const openLogin = (url) => url && window.open(url, '_blank', 'noopener')

const host = computed(() => currentOrg()?.host || '')
const connected = computed(() => !!org.orgId && !!org.version && !org.problem)
const counts = computed(() => {
  const c = { DMO: 0, DLO: 0, CI: 0 }
  for (const o of catalog.objects) c[o.kind] = (c[o.kind] || 0) + 1
  return c
})

// Help text per sidebar page (the help topic is the page path without its slash).
const TOPIC = { '/objects': 'objects', '/sql': 'sql', '/sql/builder': 'builder', '/bulk': 'bulk', '/profile': 'profile', '/streams': 'streams', '/models': 'models', '/identity': 'identity', '/graphs': 'graphs', '/segments': 'segments', '/activations': 'activations', '/insights': 'insights', '/personalization': 'personalization', '/flows': 'flows', '/campaigns': 'campaigns', '/compare': 'compare', '/explore': 'explore', '/health': 'health', '/connection': 'connection' }
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

// Sections fold and move (feedback #1022); order and folds kept in this browser.
const layout = ref(readLayout())
watch(layout, (l) => writeLayout(l), { deep: true })
const TITLES = { connection: 'Connection', user: 'Your user in this org', loaded: 'Loaded from the org', most: '', orgs: 'Your orgs', recent: 'Recent queries', privacy: 'Read only, and private', oauth: 'Log in with OAuth', all: 'Everything in the tool' }
const titleOf = (id) => (id === 'most' ? (most.value.length ? 'Most used' : 'Good places to start') : TITLES[id])
const shownIds = computed(() => layout.value.order.filter((id) => (id === 'user' || id === 'loaded' ? connected.value : id === 'recent' ? recent.value.length : true)))
const isFolded = (id) => layout.value.folded.includes(id)
function toggle(id) { layout.value.folded = isFolded(id) ? layout.value.folded.filter((x) => x !== id) : [...layout.value.folded, id] }
function move(id, step) {
  // Step over sections not shown right now, so a click always moves it visibly.
  const shown = shownIds.value
  const target = shown[shown.indexOf(id) + step]
  if (!target) return
  layout.value.order = moveSection(layout.value.order, id, step < 0 ? { before: target } : { before: layout.value.order[layout.value.order.indexOf(target) + 1] || null })
}
function dropOn(target, id) { if (id && id !== target) layout.value.order = moveSection(layout.value.order, id, { before: target }) }
</script>

<template>
  <section class="max-w-6xl mx-auto space-y-3 pb-10">
    <p class="text-xs text-muted-foreground">Fold a section with its title; move it with the arrows or drag it by its handle.</p>
    <HomeSection v-for="(id, i) in shownIds" :id="id" :key="id" :title="titleOf(id)" :folded="isFolded(id)" :first="i === 0" :last="i === shownIds.length - 1" @toggle="toggle(id)" @move="move(id, $event)" @drop="dropOn(id, $event)">
      <template v-if="id === 'connection'">
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
            <p class="text-sm text-muted-foreground">{{ org.orgId ? 'Log in again' : 'Log in' }} to a Salesforce org with Data Cloud in this browser. The login opens in a new tab; come back here afterwards and this page connects. If the org refuses the browser session, use Log in with OAuth below.</p>
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
      <UserContext v-else-if="id === 'user'" compact />
      <LoadedSections v-else-if="id === 'loaded'" />
      <div v-else-if="id === 'most'" class="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <RouterLink v-for="n in (most.length ? most : starters)" :key="n.path" :to="n.path" class="group border rounded-md bg-card p-3 hover:bg-accent">
          <div class="flex items-center gap-2 font-medium text-sm">{{ n.label }}<span v-if="n.n" class="text-xs text-muted-foreground font-normal">{{ n.n }} {{ n.n === 1 ? 'visit' : 'visits' }}</span><ArrowRight class="w-3.5 h-3.5 ml-auto opacity-0 group-hover:opacity-100" /></div>
          <p class="text-xs text-muted-foreground line-clamp-2">{{ HELP[TOPIC[n.path]]?.text }}</p>
        </RouterLink>
      </div>
      <SavedOrgs v-else-if="id === 'orgs'" bare />
      <ul v-else-if="id === 'recent'" class="border rounded-md divide-y text-sm">
        <li v-for="h in recent" :key="h.at">
          <button class="w-full text-left px-3 py-2 hover:bg-accent" @click="router.push({ path: '/sql', query: { sql: h.sql } })">
            <div class="font-mono text-xs truncate">{{ short(h.sql) }}</div>
            <div class="text-xs text-muted-foreground">{{ new Date(h.at).toLocaleString() }} · {{ h.error ? 'failed' : `${(h.rows ?? 0).toLocaleString()} rows` }}</div>
          </button>
        </li>
      </ul>
      <div v-else-if="id === 'privacy'" class="text-sm space-y-1.5">
        <div class="flex items-center gap-2 font-medium"><ShieldCheck class="w-4 h-4 text-green-600" /> Nothing is ever changed in your org</div>
        <ul class="text-muted-foreground space-y-1 list-disc pl-5">
          <li>The tool only reads, and its SQL queries only read too.</li>
          <li>It uses the Salesforce login already in this browser (or an OAuth login). The session stays inside the extension and is sent only to your own org. The extension calls nothing but Salesforce: feedback opens an email in your own mail app, and Open in Diagramforce (off unless you turn it on in Settings) hands a diagram's names, no records, to diagramforce.com.</li>
          <li>Settings, saved queries, query history and the metadata cache are kept in this browser. Bulk lookup and Compare results are kept only until the browser closes. Other records and query results are not stored. <a href="privacy.html" target="_blank" rel="noopener" class="text-link hover:underline">Privacy policy</a></li>
        </ul>
      </div>
      <OAuthLogin v-else-if="id === 'oauth'" />
      <div v-else-if="id === 'all'" class="space-y-2">
        <RouterLink to="/help" class="text-xs text-link hover:underline">Help</RouterLink>
        <div class="grid md:grid-cols-2 xl:grid-cols-3 gap-3 items-start">
          <div v-for="(g, gi) in groups" :key="gi" class="border rounded-md bg-card divide-y">
            <RouterLink v-for="n in g" :key="n.path" :to="n.path" class="block px-3 py-2 hover:bg-accent">
              <div class="text-sm">{{ n.label }}</div>
              <p class="text-xs text-muted-foreground line-clamp-2">{{ HELP[TOPIC[n.path]]?.text }}</p>
            </RouterLink>
          </div>
        </div>
      </div>
    </HomeSection>
  </section>
</template>
