<script setup>
import { ref, computed } from 'vue'
import { Check, X, Copy, Play } from 'lucide-vue-next'
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

    <div class="flex gap-2">
      <button
        class="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
        :disabled="!org.orgId || running" @click="run"
      >
        <Play class="w-4 h-4" /> {{ running ? 'Checking…' : 'Run checks' }}
      </button>
      <button
        v-if="results.length && !running"
        class="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm hover:bg-accent"
        title="Statuses, errors and response shapes (key names and types). No record values."
        @click="copyReport"
      >
        <Copy class="w-4 h-4" /> {{ copied ? 'Copied' : 'Copy report (no data values)' }}
      </button>
    </div>

    <table v-if="results.length" class="w-full text-sm border rounded-md bg-card">
      <thead class="text-left text-muted-foreground border-b">
        <tr>
          <th class="p-2 w-8"></th>
          <th class="p-2">Check</th>
          <th class="p-2">Request</th>
          <th class="p-2">Status</th>
          <th class="p-2 text-right">ms</th>
          <th class="p-2">Result</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="r in results" :key="r.id">
          <tr class="border-b hover:bg-accent cursor-pointer align-top" @click="open = open === r.id ? null : r.id">
            <td class="p-2">
              <Check v-if="r.ok" class="w-4 h-4 text-green-600" />
              <X v-else class="w-4 h-4 text-destructive" />
            </td>
            <td class="p-2 whitespace-nowrap">{{ r.label }}</td>
            <td class="p-2 font-mono text-xs break-all">{{ r.method }} {{ r.path }}</td>
            <td class="p-2">{{ r.status || 'none' }}</td>
            <td class="p-2 text-right">{{ r.ms }}</td>
            <td class="p-2" :class="{ 'text-destructive': !r.ok }">{{ r.ok ? r.summary : r.error }}</td>
          </tr>
          <tr v-if="open === r.id" class="border-b">
            <td colspan="6" class="p-3 space-y-2 bg-background">
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
      </tbody>
    </table>
  </section>
</template>
