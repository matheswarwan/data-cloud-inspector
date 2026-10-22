<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { Monitor, Sun, Moon } from 'lucide-vue-next'
import { useSettings } from '../app/useSettings.js'
import { useOrg, currentOrg, recheckOrg } from '../app/useOrg.js'
import { send } from '../lib/api.js'
import { forgetCatalog } from '../app/useCatalog.js'
import { useQueries, loadQueries, saveQuery, clearHistory } from '../app/useQueries.js'
import { storeAll, storeRemove } from '../lib/store.js'
import { FEEDBACK_CONTACT_KEY } from '../lib/feedbackContact.js'

const settings = useSettings()
const org = useOrg()
const queries = useQueries()
const caches = ref([]) // [{ orgId, host, objects, loadedAt, kb }]
const contact = ref(null)
const notice = ref('')
const fileInput = ref(null)

const version = chrome.runtime?.getManifest?.().version || 'dev'

// Log in with OAuth, for orgs that reject the browser session (API Access Control).
const oauth = ref(null) // { active, since, clientId, redirectUri }
const clientId = ref('')
const oauthBusy = ref(false)
const oauthMsg = ref('')
async function loadOauth() {
  if (!org.orgId) return
  oauth.value = await send({ type: 'OAUTH_STATUS', orgId: org.orgId })
  if (!clientId.value) clientId.value = oauth.value?.clientId || ''
}
async function oauthLogin() {
  oauthBusy.value = true
  oauthMsg.value = ''
  const res = await send({ type: 'OAUTH_LOGIN', orgId: org.orgId, clientId: clientId.value })
  oauthBusy.value = false
  oauthMsg.value = res?.ok ? `Logged in with OAuth${res.scope ? ` (scopes: ${res.scope})` : ''}. Calls to this org now use the OAuth token until the browser closes.` : `Could not log in: ${res?.error || 'no answer'}`
  await loadOauth()
  if (res?.ok) recheckOrg()
}
async function oauthLogout() {
  await send({ type: 'OAUTH_LOGOUT', orgId: org.orgId })
  oauthMsg.value = 'Logged out of OAuth; calls use the browser session again.'
  await loadOauth()
  recheckOrg()
}

async function refresh() {
  const all = await storeAll()
  caches.value = Object.entries(all)
    .filter(([k]) => k.startsWith('dci_catalog_'))
    .map(([k, v]) => {
      const orgId = k.slice('dci_catalog_'.length)
      return { orgId, host: org.orgs.find((o) => o.orgId === orgId)?.host || orgId, objects: v?.objects?.length || 0, loadedAt: v?.loadedAt, kb: Math.round(JSON.stringify(v).length / 1024) }
    })
  contact.value = all[FEEDBACK_CONTACT_KEY] || null
}

onMounted(() => { loadQueries(); refresh(); loadOauth() })
watch(() => org.orgs, refresh) // the org list may arrive after this page opens
watch(() => org.orgId, () => { clientId.value = ''; oauthMsg.value = ''; loadOauth() })

async function clearCache(c) {
  await forgetCatalog(c.orgId)
  notice.value = `Cleared the metadata of ${c.host}. It loads again the next time you open Objects, SQL or Profiles.`
  refresh()
}

async function forgetContact() {
  await storeRemove(FEEDBACK_CONTACT_KEY)
  notice.value = 'Forgot the feedback name and email.'
  refresh()
}

async function wipeHistory() {
  if (!confirm(`Delete all ${queries.history.length} queries in the run history?`)) return
  await clearHistory()
  notice.value = 'Cleared the run history.'
}

function exportQueries() {
  const body = JSON.stringify({ app: 'data-cloud-inspector', version, savedQueries: queries.saved }, null, 2)
  const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }))
  Object.assign(document.createElement('a'), { href: url, download: 'data-cloud-inspector-queries.json' }).click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function importQueries(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  try {
    const data = JSON.parse(await file.text())
    const list = Array.isArray(data) ? data : data.savedQueries
    if (!Array.isArray(list)) throw new Error('no savedQueries list in the file')
    let added = 0
    for (const q of list) {
      if (typeof q?.sql !== 'string' || typeof q?.name !== 'string') continue
      if (queries.saved.some((s) => s.name === q.name && s.sql === q.sql)) continue
      await saveQuery({ name: q.name, sql: q.sql })
      added++
    }
    notice.value = `Imported ${added} saved ${added === 1 ? 'query' : 'queries'} (${list.length - added} skipped as duplicates or invalid).`
  } catch (err) {
    notice.value = `Could not import: ${err.message}`
  }
}

const THEMES = [
  { id: 'system', label: 'System', icon: Monitor },
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
]
const when = (iso) => (iso ? new Date(iso).toLocaleString() : '')
const card = 'border rounded-md bg-card p-4 space-y-3'
const btn = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-sm hover:bg-accent disabled:opacity-50'
const savedCount = computed(() => queries.saved.length)
</script>

<template>
  <section class="max-w-3xl mx-auto space-y-4">
    <h2 class="text-lg font-semibold">Settings</h2>
    <p v-if="notice" class="text-sm text-muted-foreground">{{ notice }}</p>

    <div :class="card">
      <h3 class="font-medium">Appearance</h3>
      <div class="flex gap-2" role="radiogroup" aria-label="Theme">
        <button
          v-for="t in THEMES" :key="t.id" role="radio" :aria-checked="settings.theme === t.id"
          :class="['inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm', settings.theme === t.id ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent']"
          @click="settings.theme = t.id"
        ><component :is="t.icon" class="w-4 h-4" /> {{ t.label }}</button>
      </div>
      <p class="text-xs text-muted-foreground">System follows your computer's light or dark setting.</p>
    </div>

    <div :class="card">
      <h3 class="font-medium">Cached metadata</h3>
      <p class="text-sm text-muted-foreground">
        The list of DLOs, DMOs and calculated insights with their fields is kept per org so Objects, SQL autocomplete
        and Profiles start fast. No records or query results are stored. Clear it if objects changed in the org
        (Refresh on the Objects page does the same for the current org).
      </p>
      <p v-if="!caches.length" class="text-sm text-muted-foreground">Nothing cached yet.</p>
      <ul class="text-sm divide-y">
        <li v-for="c in caches" :key="c.orgId" class="py-2 flex items-center gap-3">
          <div class="flex-1 min-w-0">
            <div class="truncate">{{ c.host }}</div>
            <div class="text-xs text-muted-foreground">{{ c.objects }} objects, {{ c.kb }} KB, loaded {{ when(c.loadedAt) }}</div>
          </div>
          <button :class="btn" @click="clearCache(c)">Clear</button>
        </li>
      </ul>
    </div>

    <div :class="card">
      <h3 class="font-medium">Saved queries and history</h3>
      <p class="text-sm text-muted-foreground">{{ savedCount }} saved {{ savedCount === 1 ? 'query' : 'queries' }}, {{ queries.history.length }} in the run history. Both stay in this browser.</p>
      <div class="flex flex-wrap gap-2">
        <button :class="btn" :disabled="!savedCount" @click="exportQueries">Export saved queries</button>
        <button :class="btn" @click="fileInput?.click()">Import saved queries</button>
        <input ref="fileInput" type="file" accept="application/json,.json" class="hidden" @change="importQueries" />
        <button :class="btn" :disabled="!queries.history.length" @click="wipeHistory">Clear run history</button>
      </div>
    </div>

    <div :class="card">
      <h3 class="font-medium">Log in with OAuth</h3>
      <p class="text-sm text-muted-foreground">
        Only needed when an org rejects the browser session, usually because API Access Control is on.
        It uses an External Client App in that org, so an admin has to create one first.
      </p>
      <template v-if="org.orgId && oauth">
        <p class="text-sm">For <strong>{{ currentOrg()?.host }}</strong>: {{ oauth.active ? `logged in with OAuth since ${when(oauth.since)}` : 'using the browser session' }}.</p>
        <ol class="text-sm list-decimal pl-5 space-y-1">
          <li>In the org's Setup, create an External Client App with OAuth enabled, the API scope and the Data Cloud scopes (their names start with cdp_), and PKCE required.</li>
          <li>Callback URL: <code class="text-xs break-all select-all">{{ oauth.redirectUri }}</code></li>
          <li>Paste its consumer key (client ID) here and log in. The token is kept until the browser closes.</li>
        </ol>
        <div class="flex flex-wrap gap-2">
          <input v-model="clientId" placeholder="Client ID (consumer key)" class="flex-1 min-w-64 border rounded-md px-2 py-1 bg-background text-sm font-mono" />
          <button class="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50" :disabled="oauthBusy || !clientId.trim()" @click="oauthLogin">{{ oauthBusy ? 'Waiting for login…' : 'Log in with OAuth' }}</button>
          <button v-if="oauth.active" :class="btn" @click="oauthLogout">Log out of OAuth</button>
        </div>
        <p v-if="oauthMsg" class="text-sm">{{ oauthMsg }}</p>
      </template>
      <p v-else class="text-sm text-muted-foreground">No org selected.</p>
    </div>

    <div :class="card">
      <h3 class="font-medium">Feedback</h3>
      <p class="text-sm text-muted-foreground">
        <template v-if="contact">The feedback form fills in {{ [contact.name, contact.email].filter(Boolean).join(', ') }}.</template>
        <template v-else>No name or email remembered for feedback.</template>
      </p>
      <button v-if="contact" :class="btn" @click="forgetContact">Forget name and email</button>
    </div>

    <div :class="card">
      <h3 class="font-medium">About</h3>
      <p class="text-sm text-muted-foreground">
        Data Cloud Inspector {{ version }}. Read only: it uses your Salesforce login in this browser and never changes data or setup.
        The session stays in the extension's background worker.
      </p>
    </div>
  </section>
</template>
