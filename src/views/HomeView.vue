<script setup>
// Home (design option D, 2026-10-28): a search box over everything with its results right
// under it, the pages to start with, your orgs and recent queries. Connection, user, what was loaded, privacy, OAuth and the
// list of every page sit in the Session and setup menu, each opening in a panel.
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { Search, SlidersHorizontal, ChevronDown, Plug, User, Database, ShieldCheck, KeyRound, Menu, X } from 'lucide-vue-next'
import { useOrg, loadOrgs, orgName } from '../app/useOrg.js'
import SavedOrgs from '../components/SavedOrgs.vue'
import UserContext from '../components/UserContext.vue'
import LoadedSections from '../components/LoadedSections.vue'
import OAuthLogin from '../components/OAuthLogin.vue'
import ConnectionStatus from '../components/home/ConnectionStatus.vue'
import PrivacyNote from '../components/home/PrivacyNote.vue'
import AllPages from '../components/home/AllPages.vue'
import { ensureCatalog } from '../app/useCatalog.js'
import { useQueries, loadQueries } from '../app/useQueries.js'
import { loadSearchIndex, useSearchItems } from '../app/useSearchIndex.js'
import { searchPalette } from '../lib/palette.js'
import { NAV } from '../app/router.js'
import { navIcon, PAGE_TOPIC } from '../app/navIcons.js'
import { HELP } from '../lib/help.js'
import { topVisits, fillCards } from '../lib/visits.js'

const router = useRouter()
const org = useOrg()
const queries = useQueries()
onMounted(() => { ensureCatalog(); loadQueries(); loadSearchIndex(); document.addEventListener('visibilitychange', onVisible); document.addEventListener('mousedown', onOutside); window.addEventListener('keydown', onKey) })
onBeforeUnmount(() => { document.removeEventListener('visibilitychange', onVisible); document.removeEventListener('mousedown', onOutside); window.removeEventListener('keydown', onKey) })
const connected = computed(() => !!org.orgId && !!org.version && !org.problem)
// Back from logging in to an org in another tab: look for its session again (feedback #109).
function onVisible() { if (document.visibilityState === 'visible' && !connected.value && !org.loading) loadOrgs() }

// Search (same index as Ctrl/Cmd+K: pages, objects, fields, segments, saved queries, and Find
// person), results listed under the box; arrows move, Enter opens, Esc closes.
const text = ref('')
const searchBox = ref(null)
const resultsOpen = ref(false)
const active = ref(0)
const items = useSearchItems()
const results = computed(() => (text.value.trim() ? searchPalette(items.value, text.value, { limit: 10 }) : []))
watch(text, (t) => { active.value = 0; resultsOpen.value = !!t.trim() })
function openResult(r) { if (!r) return; resultsOpen.value = false; router.push(r.to) }
const search = () => openResult(results.value[active.value])
function onSearchKey(e) {
  if (!resultsOpen.value || !results.value.length) return
  if (e.key === 'ArrowDown') { active.value = Math.min(active.value + 1, results.value.length - 1); e.preventDefault() }
  else if (e.key === 'ArrowUp') { active.value = Math.max(active.value - 1, 0); e.preventDefault() }
}

// Always six cards: the most used pages first, then the usual places to start, then the rest
// of the sidebar.
const pages = NAV.filter((n) => n.path !== '/')
const byPath = new Map(pages.map((n) => [n.path, n]))
const most = computed(() => topVisits(6).filter((v) => byPath.has(v.path)).map((v) => ({ ...byPath.get(v.path), n: v.n })))
const STARTERS = ['/profile', '/sql', '/objects', '/segments', '/health', '/models']
const cards = computed(() => fillCards(most.value, STARTERS, pages))
// One colour per page; the shadow is the same hue (r,g,b).
const TONES = {
  violet: ['bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300', 'border-violet-100 dark:border-violet-500/25', '124,58,237'],
  blue: ['bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300', 'border-blue-100 dark:border-blue-500/25', '37,99,235'],
  teal: ['bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300', 'border-teal-100 dark:border-teal-500/25', '13,148,136'],
  orange: ['bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300', 'border-orange-100 dark:border-orange-500/25', '234,88,12'],
  pink: ['bg-pink-50 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300', 'border-pink-100 dark:border-pink-500/25', '219,39,119'],
  indigo: ['bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300', 'border-indigo-100 dark:border-indigo-500/25', '79,70,229'],
}
const PAGE_TONE = { '/profile': 'violet', '/sql': 'blue', '/objects': 'teal', '/segments': 'orange', '/health': 'pink', '/models': 'indigo' }
const ORDER = Object.keys(TONES)
const tone = (path, i) => TONES[PAGE_TONE[path] || ORDER[i % ORDER.length]]

const recent = computed(() => queries.history.slice(0, 4))
const short = (sql) => sql.replace(/\s+/g, ' ').slice(0, 120)

// Session and setup: a menu; each item opens its panel.
const MENU = [
  { id: 'connection', title: 'Connection', note: 'Instance, API version and login', icon: Plug },
  { id: 'user', title: 'Your user in this org', note: 'Who you are logged in as', icon: User, needs: 'connected' },
  { id: 'loaded', title: 'Loaded from the org', note: 'What the tool has read so far', icon: Database, needs: 'connected' },
  { id: 'privacy', title: 'Read only, and private', note: 'How your data is handled', icon: ShieldCheck },
  { id: 'oauth', title: 'Log in with OAuth', note: 'For orgs that refuse the browser session', icon: KeyRound },
]
const menuItems = computed(() => MENU.filter((m) => !m.needs || connected.value))
const menuOpen = ref(false)
const menuBox = ref(null)
const panel = ref(null) // id of the open panel
const panelTitle = computed(() => (panel.value === 'all' ? 'Everything in the tool' : MENU.find((m) => m.id === panel.value)?.title || ''))
function openPanel(id) { menuOpen.value = false; panel.value = id }
function onOutside(e) {
  if (menuOpen.value && menuBox.value && !menuBox.value.contains(e.target)) menuOpen.value = false
  if (resultsOpen.value && searchBox.value && !searchBox.value.contains(e.target)) resultsOpen.value = false
}
function onKey(e) { if (e.key === 'Escape') { if (panel.value) panel.value = null; else { menuOpen.value = false; resultsOpen.value = false } } }
</script>

<template>
  <section class="max-w-[1080px] mx-auto flex flex-col gap-8 pt-4 pb-10 px-0 sm:px-4">
    <div ref="menuBox" class="relative flex justify-end -mb-6 z-10">
      <button
        class="h-[38px] inline-flex items-center gap-2 px-3 rounded-lg border bg-card text-sm font-medium shadow-sm hover:bg-accent"
        :aria-expanded="menuOpen" aria-haspopup="menu" @click="menuOpen = !menuOpen"
      ><SlidersHorizontal class="w-4 h-4" /> Session &amp; setup <ChevronDown class="w-4 h-4" /></button>
      <div v-if="menuOpen" class="absolute right-0 top-[46px] w-80 rounded-xl border bg-card shadow-xl p-1.5 flex flex-col" role="menu">
        <button v-for="m in menuItems" :key="m.id" role="menuitem" class="flex gap-3 p-2.5 rounded-lg text-left hover:bg-accent" @click="openPanel(m.id)">
          <component :is="m.icon" class="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
          <span class="flex flex-col gap-0.5"><span class="text-sm font-medium">{{ m.title }}</span><span class="text-xs text-muted-foreground">{{ m.note }}</span></span>
        </button>
        <div class="h-px bg-border mx-1.5 my-1" />
        <button role="menuitem" class="flex items-center gap-3 p-2.5 rounded-lg text-left text-sm font-medium hover:bg-accent" @click="openPanel('all')"><Menu class="w-4 h-4 text-muted-foreground" /> Everything in the tool</button>
      </div>
    </div>

    <div class="relative flex flex-col items-center text-center gap-[18px]">
      <div aria-hidden="true" class="pointer-events-none absolute top-10 left-1/2 -ml-[320px] w-[640px] max-w-full h-[180px] rounded-[50%] bg-teal-600/10 dark:bg-teal-400/10 blur-[50px]" />
      <div class="relative flex flex-col gap-2">
        <h1 class="text-[30px] leading-[38px] font-bold tracking-tight">Data Cloud Inspector</h1>
        <p v-if="org.orgId" class="text-[15px] text-muted-foreground">Find anything in <span class="font-semibold text-foreground">{{ orgName(org.orgId) }}</span>: a person, an object, a field or a segment.</p>
        <p v-else class="text-[15px] text-muted-foreground">Find a person, an object, a field or a segment in your Data Cloud org.</p>
      </div>
      <form ref="searchBox" class="relative w-full max-w-[720px] text-left" role="search" @submit.prevent="search">
        <label for="home-search" class="sr-only">Search your org</label>
        <div class="flex items-center gap-3 h-[60px] pl-5 pr-2 rounded-full border border-teal-200 dark:border-teal-500/30 bg-card shadow-[0_0_0_6px_rgba(13,148,136,0.07),0_16px_36px_-18px_rgba(13,148,136,0.45)]">
          <Search class="w-5 h-5 shrink-0 text-teal-700 dark:text-teal-300" aria-hidden="true" />
          <input
            id="home-search" v-model="text" type="text" autocomplete="off" placeholder="Search profiles, objects, fields, segments…"
            class="flex-1 min-w-0 bg-transparent outline-none text-base" role="combobox" aria-controls="home-results" :aria-expanded="resultsOpen && results.length > 0"
            :aria-activedescendant="resultsOpen && results.length ? `home-result-${active}` : undefined"
            @keydown="onSearchKey" @focus="resultsOpen = !!text.trim()"
          />
          <button type="submit" class="h-11 px-5 rounded-full bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold disabled:opacity-60" :disabled="!results.length">Search</button>
        </div>
        <ul
          v-if="resultsOpen && results.length" id="home-results" role="listbox" aria-label="Search results"
          class="absolute z-20 left-0 right-0 top-[70px] max-h-[420px] overflow-y-auto rounded-2xl border border-teal-100 dark:border-teal-500/25 bg-card p-1.5 shadow-[0_20px_40px_-16px_rgba(13,148,136,0.35)]"
        >
          <li
            v-for="(r, i) in results" :id="`home-result-${i}`" :key="`${r.kind}${r.label}${r.detail}`" role="option" :aria-selected="i === active"
            :class="['flex items-baseline gap-3 px-3 py-2 rounded-lg cursor-pointer text-sm', i === active ? 'bg-teal-50 dark:bg-teal-500/10' : '']"
            @mouseenter="active = i" @mousedown.prevent="openResult(r)"
          >
            <span class="w-16 shrink-0 text-xs text-muted-foreground">{{ r.kind }}</span>
            <span class="truncate font-medium">{{ r.label }}</span>
            <span class="ml-auto truncate text-xs text-muted-foreground font-mono max-w-[45%]">{{ r.detail }}</span>
          </li>
        </ul>
        <p v-else-if="resultsOpen && text.trim()" class="absolute z-20 left-0 right-0 top-[70px] rounded-2xl border bg-card px-4 py-3 text-sm text-muted-foreground shadow-lg">Nothing found.</p>
      </form>
    </div>

    <div v-if="!connected && !org.loading" class="rounded-xl border bg-card p-5"><ConnectionStatus /></div>

    <section class="flex flex-col gap-3.5">
      <h2 class="text-lg font-semibold">{{ most.length ? 'Most used' : 'Good places to start' }}</h2>
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <RouterLink
          v-for="(n, i) in cards" :key="n.path" :to="n.path"
          :class="['rounded-[14px] border bg-card p-5 flex flex-col gap-2.5 hover:-translate-y-px transition-transform', tone(n.path, i)[1]]"
          :style="{ boxShadow: `0 14px 32px -18px rgba(${tone(n.path, i)[2]},0.45)` }"
        >
          <span :class="['w-9 h-9 rounded-[10px] flex items-center justify-center', tone(n.path, i)[0]]"><component :is="navIcon(n.icon)" class="w-[18px] h-[18px]" aria-hidden="true" /></span>
          <span class="text-base font-semibold">{{ n.label }}<span v-if="n.n" class="ml-2 text-xs font-normal text-muted-foreground">{{ n.n }} {{ n.n === 1 ? 'visit' : 'visits' }}</span></span>
          <span class="text-[13px] leading-[19px] text-muted-foreground">{{ HELP[PAGE_TOPIC[n.path]]?.text }}</span>
        </RouterLink>
      </div>
    </section>

    <SavedOrgs />

    <section v-if="recent.length" class="rounded-xl border bg-card p-5 flex flex-col gap-3">
      <h2 class="text-lg font-semibold">Recent queries</h2>
      <ul class="border rounded-md divide-y text-sm">
        <li v-for="h in recent" :key="h.at">
          <button class="w-full text-left px-3 py-2 hover:bg-accent" @click="router.push({ path: '/sql', query: { sql: h.sql } })">
            <div class="font-mono text-xs truncate">{{ short(h.sql) }}</div>
            <div class="text-xs text-muted-foreground">{{ new Date(h.at).toLocaleString() }} · {{ h.error ? 'failed' : `${(h.rows ?? 0).toLocaleString()} rows` }}</div>
          </button>
        </li>
      </ul>
    </section>

    <footer class="flex justify-center pt-6 pb-2">
      <img src="/images/ateko-bell.svg" alt="Ateko, backed by Bell Canada" class="h-14 w-auto dark:invert" />
    </footer>

    <div v-if="panel" class="fixed inset-0 z-40 bg-black/40 flex items-start justify-center pt-20 px-4" @mousedown.self="panel = null">
      <div class="w-full max-w-3xl max-h-[80vh] flex flex-col rounded-xl border bg-card shadow-2xl" role="dialog" aria-modal="true" :aria-label="panelTitle">
        <div class="flex items-center gap-2 px-5 py-3 border-b">
          <h2 class="flex-1 text-base font-semibold">{{ panelTitle }}</h2>
          <button class="p-1 rounded hover:bg-accent" aria-label="Close" @click="panel = null"><X class="w-4 h-4" /></button>
        </div>
        <div class="flex-1 min-h-0 overflow-y-auto p-5">
          <ConnectionStatus v-if="panel === 'connection'" />
          <UserContext v-else-if="panel === 'user'" compact />
          <LoadedSections v-else-if="panel === 'loaded'" />
          <PrivacyNote v-else-if="panel === 'privacy'" />
          <OAuthLogin v-else-if="panel === 'oauth'" />
          <AllPages v-else-if="panel === 'all'" />
        </div>
      </div>
    </div>
  </section>
</template>
