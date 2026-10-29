<script setup>
import PageHeader from '../components/PageHeader.vue'
import OAuthLogin from '../components/OAuthLogin.vue'
import { ref, computed, onMounted, watch } from 'vue'
import { useApiConsole, setApiConsole } from '../app/useApiConsole.js'
import { tipsOn, setTipsOn, resetTips } from '../lib/tips.js'
import { preloadOn, setPreloadOn } from '../lib/preload.js'
import { Monitor, Sun, Moon } from 'lucide-vue-next'
import { useSettings } from '../app/useSettings.js'
import { useOrg, currentOrg, recheckOrg, orgName } from '../app/useOrg.js'
import { send } from '../lib/api.js'
import { resetCatalog, ensureCatalog } from '../app/useCatalog.js'
import { readStorage, deleteKeys, formatBytes } from '../lib/storageUsage.js'
import { askConfirm } from '../app/useDialog.js'
import { useQueries, loadQueries, saveQuery, clearHistory, reloadQueries } from '../app/useQueries.js'
import { storeAll, storeRemove } from '../lib/store.js'
import { FEEDBACK_CONTACT_KEY } from '../lib/feedbackContact.js'
import { diagramforceAllowed, diagramforceOn, setDiagramforceOn } from '../lib/diagramforce.js'
import { OPTIONAL_PAGES, shownPages, setPageShown } from '../lib/optionalPages.js'
import { CACHE_AGES, cacheHours, setCacheHours } from '../lib/cacheAge.js'
import { ALL_NAV, refreshNav } from '../app/router.js'
import { policy, policyOverrides } from '../lib/policy.js'
import { isOn } from '../lib/features.js'

// Administrator policy (chrome.storage.managed): shown read only.
const managed = policy()
const POLICY_TEXT = {
  authMode: (v) => (v === 'oauth-only' ? 'Log in with OAuth only: the browser session is never used.' : ''),
  allowedOrgDomains: (v) => `Only these orgs: ${v.join(', ')}.`,
  disableCache: () => 'Org metadata and Health results are kept only until the browser closes.',
  disableQueryHistory: () => 'No query history is kept.',
  disableDiagramforce: () => 'Open in Diagramforce is turned off.',
  disableFeedbackUpload: () => 'Feedback opens an email only; nothing is sent to the feedback service.',
}
const managedLines = policyOverrides(managed).map((k) => POLICY_TEXT[k](managed[k]))

const diagramforce = ref(diagramforceOn())
function toggleDiagramforce(on) { setDiagramforceOn(on); diagramforce.value = diagramforceOn() }
// Pages hidden until turned on here (feedback #1041).
const optionalPages = ALL_NAV.filter((n) => OPTIONAL_PAGES.includes(n.feature) && isOn(n.feature))
const PAGE_NOTES = {
  personalization: 'Personalization points, decisions, recommenders and experiments.',
  marketingFlows: 'Marketing Cloud Next flows.',
  campaigns: 'Marketing Cloud Next campaigns.',
}
const shown = ref(shownPages())
// How long org details are used from this browser (feedback #1043).
const cacheAge = ref(cacheHours())
function saveCacheAge() { setCacheHours(cacheAge.value); cacheAge.value = cacheHours() }
const policyCacheOff = !!policy().disableCache
function togglePage(feature, on) { setPageShown(feature, on); shown.value = shownPages(); refreshNav() }

// Orgs on *.cloudforce.com (older instances) need an optional host permission.
const CLOUDFORCE = { origins: ['https://*.cloudforce.com/*'] }
const cloudforce = ref(false)
chrome.permissions?.contains?.(CLOUDFORCE).then((v) => { cloudforce.value = v }).catch(() => {})
async function toggleCloudforce(on) {
  try {
    cloudforce.value = on ? await chrome.permissions.request(CLOUDFORCE) : !(await chrome.permissions.remove(CLOUDFORCE))
  } catch { /* not in an extension */ }
}

const settings = useSettings()
const org = useOrg()
const queries = useQueries()
const contact = ref(null)
const notice = ref('')
const fileInput = ref(null)

const version = chrome.runtime?.getManifest?.().version || 'dev'

const oauthBox = ref(null)

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
  if (groupId === 'oauthTokens' || groupId === 'all') { await oauthBox.value?.load(); recheckOrg() }
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

onMounted(() => { loadQueries(); refresh() })
watch(() => org.orgs, refresh) // the org list may arrive after this page opens


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
const card = 'dci-card p-5 space-y-3'
const btn = 'dci-btn'
const savedCount = computed(() => queries.saved.length)
const apiConsole = useApiConsole()
const tips = ref(tipsOn())
function toggleTips(on) { setTipsOn(on); tips.value = on }
const preload = ref(preloadOn())
function togglePreload(on) { setPreloadOn(on); preload.value = on }
function showTipsAgain() { setTipsOn(true); resetTips(); tips.value = true }
</script>

<template>
  <section class="max-w-3xl mx-auto space-y-4">
    <PageHeader path="/settings">Appearance, tools, what is kept in this browser, and logins.</PageHeader>
    <p v-if="notice" class="text-sm text-muted-foreground">{{ notice }}</p>

    <div v-if="managedLines.length" :class="card">
      <h3 class="font-medium">Set by your administrator</h3>
      <ul class="text-sm list-disc pl-5 space-y-0.5">
        <li v-for="l in managedLines" :key="l">{{ l }}</li>
      </ul>
    </div>

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

    <div v-if="optionalPages.length" :class="card">
      <h3 class="font-medium">Pages</h3>
      <p class="text-xs text-muted-foreground">Marketing Cloud pages, hidden from the sidebar, Home and search until you turn them on.</p>
      <label v-for="n in optionalPages" :key="n.path" class="flex items-start gap-2 text-sm">
        <input type="checkbox" class="mt-1" :checked="shown.includes(n.feature)" @change="togglePage(n.feature, $event.target.checked)" />
        <span>{{ n.label }}<span class="block text-xs text-muted-foreground">{{ PAGE_NOTES[n.feature] }}</span></span>
      </label>
    </div>

    <div :class="card">
      <h3 class="font-medium">Tools</h3>
      <label class="flex items-start gap-2 text-sm">
        <input type="checkbox" class="mt-1" :checked="apiConsole.enabled.value" @change="setApiConsole($event.target.checked)" />
        <span>API console<span class="block text-xs text-muted-foreground">A drawer at the bottom of the window that lists every call to Salesforce with its request and response, to see what a page reads or to report a problem. Kept in memory only, cleared when the tab closes.</span></span>
      </label>
      <label class="flex items-start gap-2 text-sm">
        <input type="checkbox" class="mt-1" :checked="preload" @change="togglePreload($event.target.checked)" />
        <span>Preload when connected<span class="block text-xs text-muted-foreground">As soon as an org is connected, read its objects, data streams, mappings and usage, and run the Health check, in the background, so pages open without a wait. The Health result is kept in this browser and checked again when over an hour old. Uses a few read-only API calls per org.</span></span>
      </label>
      <label class="flex items-start gap-2 text-sm">
        <input type="checkbox" class="mt-1" :checked="tips" @change="toggleTips($event.target.checked)" />
        <span>Tips on first visits<span class="block text-xs text-muted-foreground">Point out features that are easy to miss the first time a page opens. <button class="text-link hover:underline" @click.prevent="showTipsAgain">Show all tips again</button></span></span>
      </label>
      <label v-if="isOn('diagramforce')" class="flex items-start gap-2 text-sm" :class="diagramforceAllowed() ? '' : 'opacity-60'">
        <input type="checkbox" class="mt-1" :checked="diagramforce" :disabled="!diagramforceAllowed()" @change="toggleDiagramforce($event.target.checked)" />
        <span>Open in Diagramforce<span class="block text-xs text-muted-foreground">Adds Open in Diagramforce to data model and stream diagrams. It hands the diagram's object, field and relationship names (no records, no session) to diagramforce.com, a free diagram editor run by a third party.{{ diagramforceAllowed() ? '' : ' Turned off by your administrator.' }}</span></span>
      </label>
      <label class="flex items-start gap-2 text-sm">
        <input type="checkbox" class="mt-1" :checked="cloudforce" @change="toggleCloudforce($event.target.checked)" />
        <span>Orgs on cloudforce.com<span class="block text-xs text-muted-foreground">Only for older orgs whose domain ends in cloudforce.com. Chrome asks you to allow the extension to read and change data on those sites.</span></span>
      </label>
    </div>

    <div :class="card">
      <div class="flex items-baseline gap-3">
        <h3 class="font-medium">Storage</h3>
        <span v-if="storage" class="text-sm text-muted-foreground">{{ formatBytes(storage.total) }} in this browser</span>
        <button v-if="storage?.groups.length" :class="[btn, 'ml-auto']" @click="removeAll">Delete everything</button>
      </div>
      <p class="text-sm text-muted-foreground">
        Everything Data Cloud Inspector keeps, only in this browser. Records and query results are not kept after the
        browser closes: Bulk lookup and Compare results are session items. Session items are deleted when the browser closes.
      </p>
      <label class="flex flex-wrap items-center gap-2 text-sm">
        Keep org details for
        <select v-model.number="cacheAge" class="border rounded-md px-2 py-1 bg-background" aria-label="Keep org details for" @change="saveCacheAge">
          <option v-for="a in CACHE_AGES" :key="a.hours" :value="a.hours">{{ a.label }}</option>
        </select>
        <span class="basis-full text-xs text-muted-foreground">Segments, activations, insights, streams, mappings, flows, campaigns and data graphs read from an org are used from this browser for this long before they are read again. Older copies still show at once and refresh in the background; Refresh in the connection menu or Load again on a page reads them now.{{ policyCacheOff ? ' Your administrator set them to be kept only until the browser closes.' : '' }}</span>
      </label>
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
      <OAuthLogin ref="oauthBox" />
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
        The session stays in the extension's background worker. Published by Ateko.
        <a href="privacy.html" target="_blank" rel="noopener" class="text-link hover:underline">Privacy policy</a>
      </p>
    </div>
  </section>
</template>
