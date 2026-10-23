<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { Monitor, Sun, Moon } from 'lucide-vue-next'
import { useSettings } from '../app/useSettings.js'
import { useOrg, currentOrg, recheckOrg } from '../app/useOrg.js'
import { send } from '../lib/api.js'
import { resetCatalog, ensureCatalog } from '../app/useCatalog.js'
import { readStorage, deleteKeys, formatBytes } from '../lib/storageUsage.js'
import { askConfirm } from '../app/useDialog.js'
import { useQueries, loadQueries, saveQuery, clearHistory, reloadQueries } from '../app/useQueries.js'
import { storeAll, storeRemove } from '../lib/store.js'
import { FEEDBACK_CONTACT_KEY } from '../lib/feedbackContact.js'

const settings = useSettings()
const org = useOrg()
const queries = useQueries()
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

// Storage: everything kept in the browser, by section, with sizes and Delete.
const storage = ref(null) // { groups, total }
async function refresh() {
  storage.value = await readStorage()
  const all = await storeAll()
  contact.value = all[FEEDBACK_CONTACT_KEY] || null
}
const hostOf = (orgId) => org.orgs.find((o) => o.orgId === orgId)?.host || (orgId === 'other' ? 'other' : orgId)

async function afterDelete(groupId) {
  if (groupId === 'metadata' || groupId === 'session' || groupId === 'all') { resetCatalog(); ensureCatalog() }
  if (groupId === 'saved' || groupId === 'history' || groupId === 'all') await reloadQueries()
  if (groupId === 'oauthTokens' || groupId === 'all') { await loadOauth(); recheckOrg() }
  await refresh()
}

async function removeGroup(g, part = null) {
  const keys = part ? part.keys : g.keys
  const what = part ? `${g.label.toLowerCase()} of ${hostOf(part.orgId)}` : g.label.toLowerCase()
  if ((g.id === 'saved' || g.id === 'history') && !(await askConfirm({ title: `Delete ${what}?`, message: 'This cannot be undone.', primary: 'Delete', danger: true }))) return
  await deleteKeys(g.area, keys)
  notice.value = `Deleted ${what} (${formatBytes(part ? part.bytes : g.bytes)}).`
  await afterDelete(g.id)
}

async function removeAll() {
  if (!(await askConfirm({ title: 'Delete everything?', message: 'Caches, saved queries, history, OAuth logins and settings that Data Cloud Inspector keeps in this browser. This cannot be undone.', primary: 'Delete everything', danger: true }))) return
  for (const g of storage.value?.groups || []) await deleteKeys(g.area, g.keys)
  notice.value = 'Deleted everything the extension kept in this browser.'
  await afterDelete('all')
}

onMounted(() => { loadQueries(); refresh(); loadOauth() })
watch(() => org.orgs, refresh) // the org list may arrive after this page opens
watch(() => org.orgId, () => { clientId.value = ''; oauthMsg.value = ''; loadOauth() })


async function forgetContact() {
  await storeRemove(FEEDBACK_CONTACT_KEY)
  notice.value = 'Forgot the feedback name and email.'
  refresh()
}

async function wipeHistory() {
  if (!(await askConfirm({ title: 'Clear the run history?', message: `${queries.history.length} queries will be removed.`, primary: 'Clear', danger: true }))) return
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
      <div class="flex items-baseline gap-3">
        <h3 class="font-medium">Storage</h3>
        <span v-if="storage" class="text-sm text-muted-foreground">{{ formatBytes(storage.total) }} in this browser</span>
        <button v-if="storage?.groups.length" :class="[btn, 'ml-auto']" @click="removeAll">Delete everything</button>
      </div>
      <p class="text-sm text-muted-foreground">
        Everything Data Cloud Inspector keeps, only in this browser. No records or query results are stored.
        Session items are also deleted when the browser closes.
      </p>
      <p v-if="storage && !storage.groups.length" class="text-sm text-muted-foreground">Nothing stored.</p>
      <table v-if="storage?.groups.length" class="w-full text-sm">
        <tbody>
          <template v-for="g in storage.groups" :key="g.id">
            <tr class="border-t align-top">
              <td class="py-2 pr-3">
                <div>{{ g.label }} <span class="text-xs text-muted-foreground">({{ g.area === 'local' ? 'kept' : g.area === 'session' ? 'session' : 'page settings' }})</span></div>
                <div class="text-xs text-muted-foreground">{{ g.note }}</div>
              </td>
              <td class="py-2 pr-3 text-right whitespace-nowrap">{{ formatBytes(g.bytes) }}</td>
              <td class="py-2 text-right"><button :class="btn" @click="removeGroup(g)">Delete</button></td>
            </tr>
            <tr v-for="o in g.byOrg.length > 1 || (g.byOrg[0] && g.byOrg[0].orgId !== org.orgId) ? g.byOrg : []" :key="g.id + o.orgId" class="align-top">
              <td class="py-1 pr-3 pl-4 text-xs">{{ hostOf(o.orgId) }} <span class="text-muted-foreground">({{ o.keys.length }} {{ o.keys.length === 1 ? 'item' : 'items' }})</span></td>
              <td class="py-1 pr-3 text-right text-xs whitespace-nowrap">{{ formatBytes(o.bytes) }}</td>
              <td class="py-1 text-right"><button class="text-xs text-link hover:underline" @click="removeGroup(g, o)">Delete</button></td>
            </tr>
          </template>
        </tbody>
      </table>
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
