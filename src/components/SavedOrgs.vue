<script setup>
// Orgs this browser connected to before (feedback #109): name them, forget them, use one
// that still has a session, or open the login page of one or several. Nothing about the
// session is kept: only the org's domain, ID, the name you give it and who logged in.
import { ref, computed } from 'vue'
import { LogIn, Pencil, Trash2, RefreshCw } from 'lucide-vue-next'
import { useOrg, loadOrgs, selectOrg, renameSavedOrg, forgetSavedOrgs } from '../app/useOrg.js'
import { savedOrgRows, loginUrl } from '../lib/savedOrgs.js'
import { askConfirm, askText } from '../app/useDialog.js'

const org = useOrg()
const rows = computed(() => savedOrgRows(org.saved, org.orgs, { currentId: org.orgId, problem: org.problem }))
const picked = ref(new Set())
const toggle = (id) => { const s = new Set(picked.value); s.has(id) ? s.delete(id) : s.add(id); picked.value = s }
const allPicked = computed(() => rows.value.length > 0 && rows.value.every((r) => picked.value.has(r.orgId)))
const pickAll = () => { picked.value = allPicked.value ? new Set() : new Set(rows.value.map((r) => r.orgId)) }

const STATUS = {
  connected: ['bg-green-600', 'Connected'],
  problem: ['bg-amber-500', 'Session refused: log in again'],
  session: ['bg-sky-500', 'Logged in: ready to use'],
  none: ['bg-gray-400', 'Not logged in'],
}
const checking = ref(false)
async function check() { checking.value = true; try { await loadOrgs() } finally { checking.value = false } }

function login(list) {
  for (const r of list) { const u = loginUrl(r.host); if (u) window.open(u, '_blank', 'noopener') }
}
const loginPicked = () => login(rows.value.filter((r) => picked.value.has(r.orgId)))

async function rename(r) {
  const res = await askText({ title: 'Name this org', message: r.host, value: r.name, placeholder: 'For example Client A sandbox', primary: 'Save' })
  if (res) renameSavedOrg(r.orgId, res.value)
}
async function forget(list) {
  if (!list.length) return
  const ok = await askConfirm({ title: list.length === 1 ? `Forget ${list[0].name || list[0].host}?` : `Forget ${list.length} orgs?`, message: 'They come back here the next time you connect to them. Nothing in the org changes.', primary: 'Forget', danger: true })
  if (!ok) return
  await forgetSavedOrgs(list.map((r) => r.orgId))
  picked.value = new Set()
}
const forgetPicked = () => forget(rows.value.filter((r) => picked.value.has(r.orgId) && r.saved))
const when = (iso) => (iso ? new Date(iso).toLocaleDateString() : '')
</script>

<template>
  <div class="border rounded-md bg-card">
    <div class="p-3 border-b flex flex-wrap items-center gap-2">
      <h3 class="font-medium text-sm">Your orgs</h3>
      <span class="text-xs text-muted-foreground">Orgs you connected to in this browser. Log in to one in a new tab, then come back: this page checks again.</span>
      <button class="ml-auto inline-flex items-center gap-1 text-xs text-link hover:underline" :disabled="checking" @click="check"><RefreshCw class="w-3 h-3" :class="{ 'animate-spin': checking }" /> Check again</button>
    </div>
    <p v-if="!rows.length" class="p-3 text-sm text-muted-foreground">None yet. Log in to a Salesforce org with Data Cloud in this browser; it is listed here after it connects.</p>
    <table v-else class="w-full text-sm">
      <thead class="text-left text-muted-foreground text-xs">
        <tr>
          <th class="p-2 w-8"><input type="checkbox" :checked="allPicked" aria-label="Select every org" @change="pickAll" /></th>
          <th class="p-2 font-normal">Org</th><th class="p-2 font-normal">Status</th><th class="p-2 font-normal">Last connected</th><th class="p-2" />
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.orgId" class="border-t align-top">
          <td class="p-2"><input type="checkbox" :checked="picked.has(r.orgId)" :aria-label="`Select ${r.name || r.host}`" @change="toggle(r.orgId)" /></td>
          <td class="p-2 min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="font-medium">{{ r.name || r.host }}</span>
              <button v-if="r.saved" class="p-0.5 rounded hover:bg-accent text-muted-foreground" :aria-label="`Name ${r.host}`" title="Name this org" @click="rename(r)"><Pencil class="w-3 h-3" /></button>
            </div>
            <div v-if="r.name" class="font-mono text-xs text-muted-foreground">{{ r.host }}</div>
            <div v-if="r.username" class="text-xs text-muted-foreground">{{ r.username }}</div>
          </td>
          <td class="p-2 whitespace-nowrap"><span :class="['inline-block w-2 h-2 rounded-full mr-1.5', STATUS[r.status][0]]" />{{ STATUS[r.status][1] }}</td>
          <td class="p-2 whitespace-nowrap text-muted-foreground">{{ when(r.lastConnected) }}</td>
          <td class="p-2 whitespace-nowrap text-right space-x-2">
            <button v-if="r.status === 'session'" class="text-link hover:underline" @click="selectOrg(r.orgId)">Use</button>
            <button v-if="r.status !== 'connected'" class="inline-flex items-center gap-1 text-link hover:underline" @click="login([r])"><LogIn class="w-3 h-3" /> Log in</button>
            <button v-if="r.saved" class="p-0.5 rounded hover:bg-accent text-muted-foreground align-middle" :aria-label="`Forget ${r.name || r.host}`" title="Forget" @click="forget([r])"><Trash2 class="w-3.5 h-3.5" /></button>
          </td>
        </tr>
      </tbody>
    </table>
    <div v-if="picked.size" class="p-2 border-t flex items-center gap-3 text-sm">
      <span class="text-muted-foreground">{{ picked.size }} selected</span>
      <button class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary text-primary-foreground" @click="loginPicked"><LogIn class="w-3.5 h-3.5" /> Log in to selected</button>
      <button class="text-link hover:underline" @click="forgetPicked">Forget selected</button>
    </div>
  </div>
</template>
