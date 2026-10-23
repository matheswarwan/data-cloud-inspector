<script setup>
import DataTable from '../components/DataTable.vue'
import { ref, computed, watch } from 'vue'
import { Check, X, Copy } from 'lucide-vue-next'
import RecordLink from '../components/RecordLink.vue'
import { loadUserContext } from '../lib/userContext.js'
import { CLIENT_NAME } from '../background/fetchProxy.js'
import { useOrg, currentOrg } from '../app/useOrg.js'
import { sf } from '../lib/api.js'
import { runChecks, buildReport } from '../lib/checks.js'

const org = useOrg()
const results = ref([])
const running = ref(false)
const version = ref(null)
const open = ref(null)
const copied = ref(false)

const extensionVersion = chrome.runtime?.getManifest?.().version || 'dev'

// Who the tool runs as (feedback #84), loaded when the page opens.
const ctx = ref(null)
const ctxError = ref('')
const showAllSets = ref(false)
watch(() => [org.orgId, org.version], async ([orgId, version]) => {
  ctx.value = null
  ctxError.value = ''
  if (!orgId || !version) return
  try {
    const c = await loadUserContext((path, opts) => sf(orgId, path, opts), version)
    if (org.orgId === orgId) ctx.value = c
  } catch (err) {
    ctxError.value = err.message
  }
}, { immediate: true })

async function run() {
  if (!org.orgId) return
  running.value = true
  results.value = []
  open.value = null
  const orgId = org.orgId
  const out = await runChecks(
    (path, opts) => sf(orgId, path, opts),
    (r) => results.value.push(r),
  )
  version.value = out.version
  running.value = false
}

const report = computed(() => buildReport({ extensionVersion, version: version.value, results: results.value }))

async function copyReport() {
  await navigator.clipboard.writeText(report.value)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

const pretty = (data) => {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
  return text.length > 200000 ? text.substring(0, 200000) + '\n… (cut at 200,000 characters)' : text
}
const checkCols = [
  { key: 'ok', label: 'OK', value: (r) => (r.ok ? 'yes' : 'no'), headerClass: 'w-8' },
  { key: 'label', label: 'Check' },
  { key: 'request', label: 'Request', value: (r) => `${r.method} ${r.path}` },
  { key: 'status', label: 'Status', value: (r) => String(r.status || 'none') },
  { key: 'ms', label: 'ms', align: 'right', kind: 'number', filter: false },
  { key: 'result', label: 'Result', value: (r) => (r.ok ? r.summary : r.error) },
]
</script>

<template>
  <section class="max-w-6xl mx-auto space-y-4">
    <div class="space-y-1">
      <h2 class="text-lg font-semibold">Connection check</h2>
      <p class="text-sm text-muted-foreground">
        Checks that your browser session reaches the core API and the Data Cloud endpoints of
        <strong>{{ currentOrg()?.host || 'the selected org' }}</strong>. Every request is a read.
      </p>
    </div>

    <div class="border rounded-md bg-card">
      <h3 class="p-3 border-b font-medium flex items-center gap-2">How this tool connects</h3>
      <p v-if="ctxError" class="p-3 text-sm text-destructive">{{ ctxError }}</p>
      <p v-else-if="!ctx" class="p-3 text-sm text-muted-foreground">Loading…</p>
      <div v-else class="p-3 grid md:grid-cols-2 gap-x-8 gap-y-4 text-sm">
        <dl class="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1">
          <dt class="text-muted-foreground">Running as</dt><dd><strong>{{ ctx.name }}</strong></dd>
          <dt class="text-muted-foreground">Username</dt><dd class="break-all">{{ ctx.username }}</dd>
          <dt class="text-muted-foreground">User ID</dt><dd class="font-mono text-xs"><RecordLink :value="ctx.id" /></dd>
          <dt class="text-muted-foreground">Profile</dt><dd>{{ ctx.profile || 'unknown' }}</dd>
          <dt v-if="ctx.role" class="text-muted-foreground">Role</dt><dd v-if="ctx.role">{{ ctx.role }}</dd>
          <dt class="text-muted-foreground">User type</dt><dd>{{ ctx.userType }}</dd>
          <dt class="text-muted-foreground">Org</dt><dd>{{ currentOrg()?.host }}</dd>
          <dt class="text-muted-foreground">Org ID</dt><dd class="font-mono text-xs">{{ ctx.org.id }}</dd>
          <dt class="text-muted-foreground">Edition</dt><dd>{{ ctx.org.type }}, {{ ctx.org.sandbox ? 'sandbox' : 'production' }}{{ ctx.org.instance ? ` (${ctx.org.instance})` : '' }}</dd>
        </dl>
        <div class="space-y-2">
          <ul class="list-disc pl-5 space-y-1">
            <li>Uses the Salesforce session you already have in this browser for this org, as {{ ctx.name }}. Nothing is installed in the org and no password is asked for.</li>
            <li>Sees exactly what this user can see: object and field access come from the user's profile and permission sets.</li>
            <li>Only reads. The one kind of request that is not a plain read is a Data Cloud SQL query; anything that would change data or setup is refused before it is sent.</li>
            <li>Requests go only to https://{{ currentOrg()?.host }}. The session is never stored and never sent anywhere else.</li>
            <li>Calls are tagged <code class="text-xs">client={{ CLIENT_NAME }}</code>, so admins can see them in the org's API usage and event logs.</li>
          </ul>
          <div>
            <div class="text-muted-foreground">Data Cloud related permission sets ({{ ctx.dataCloudSets.length }})</div>
            <p v-if="!ctx.dataCloudSets.length" class="text-xs text-muted-foreground">None by name; access may come from the profile or a permission set group.</p>
            <ul class="text-xs flex flex-wrap gap-1 mt-1">
              <li v-for="p in ctx.dataCloudSets" :key="p" class="px-1.5 py-0.5 rounded bg-muted">{{ p }}</li>
            </ul>
            <button v-if="ctx.permissionSets.length" class="text-xs text-link hover:underline mt-1" @click="showAllSets = !showAllSets">
              {{ showAllSets ? 'Hide' : 'Show' }} all {{ ctx.permissionSets.length }} permission sets
            </button>
            <ul v-if="showAllSets" class="text-xs flex flex-wrap gap-1 mt-1">
              <li v-for="p in ctx.permissionSets" :key="p" class="px-1.5 py-0.5 rounded bg-muted">{{ p }}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <div class="flex gap-2">
      <button
        class="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
        :disabled="!org.orgId || running" @click="run"
      >
        {{ running ? 'Checking…' : 'Run checks' }}
      </button>
      <button
        v-if="results.length && !running"
        class="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm hover:bg-accent"
        title="Statuses, errors and response shapes (key names and types). No record values."
        @click="copyReport"
      >
        {{ copied ? 'Copied' : 'Copy report (no data values)' }}
      </button>
    </div>

    <DataTable v-if="results.length" :columns="checkCols" :rows="results" row-key="id" :row-class="() => 'hover:bg-accent cursor-pointer'" @row-click="(r) => (open = open === r.id ? null : r.id)">
      <template #cell-ok="{ row: r }"><Check v-if="r.ok" class="w-4 h-4 text-green-600" /><X v-else class="w-4 h-4 text-destructive" /></template>
      <template #cell-label="{ value }"><span class="whitespace-nowrap">{{ value }}</span></template>
      <template #cell-request="{ value }"><span class="font-mono text-xs break-all">{{ value }}</span></template>
      <template #cell-result="{ row: r, value }"><span :class="{ 'text-destructive': !r.ok }">{{ value }}</span></template>
      <template #after-row="{ row: r, colspan }">
        <tr v-if="open === r.id" class="border-t">
          <td :colspan="colspan" class="p-3 space-y-2 bg-background">
            <div v-if="r.shape">
              <div class="text-xs text-muted-foreground mb-1">Shape (keys and types)</div>
              <pre class="text-xs font-mono whitespace-pre-wrap break-all">{{ r.shape }}</pre>
            </div>
            <div v-if="r.data != null">
              <div class="text-xs text-muted-foreground mb-1">Response (contains org data; not part of the report)</div>
              <pre class="text-xs font-mono max-h-96 overflow-auto border rounded p-2">{{ pretty(r.data) }}</pre>
            </div>
          </td>
        </tr>
      </template>
    </DataTable>
  </section>
</template>
