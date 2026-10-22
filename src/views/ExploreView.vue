<script setup>
import { ref, computed, watch } from 'vue'
import { Send } from 'lucide-vue-next'
import { useOrg } from '../app/useOrg.js'
import { sf } from '../lib/api.js'
import { describeShape } from '../lib/shape.js'
import { PROBE_SQL } from '../lib/checks.js'

const org = useOrg()
const method = ref('GET')
const path = ref('')
const body = ref(JSON.stringify({ sql: PROBE_SQL }, null, 2))
const result = ref(null)
const busy = ref(false)
const showShape = ref(false)

watch(() => org.version, (v) => {
  if (v && !path.value) path.value = `/services/data/v${v}/ssot/`
}, { immediate: true })

watch(method, (m) => {
  if (m === 'POST' && org.version && !/\/ssot\/query/.test(path.value)) path.value = `/services/data/v${org.version}/ssot/query-sql`
})

async function sendRequest() {
  if (!org.orgId || !path.value) return
  let parsed
  if (method.value === 'POST') {
    try { parsed = JSON.parse(body.value) } catch (err) {
      result.value = { ok: false, status: 0, error: `Body is not valid JSON: ${err.message}` }
      return
    }
  }
  busy.value = true
  result.value = await sf(org.orgId, path.value.trim(), { method: method.value, body: parsed })
  busy.value = false
}

const text = computed(() => {
  const d = result.value?.data
  if (d == null) return ''
  if (showShape.value) return describeShape(d, 6)
  const t = typeof d === 'string' ? d : JSON.stringify(d, null, 2)
  return t.length > 500000 ? t.substring(0, 500000) + '\n… (cut at 500,000 characters)' : t
})
</script>

<template>
  <section class="max-w-6xl space-y-3">
    <div class="space-y-1">
      <h2 class="text-lg font-semibold">REST explore</h2>
      <p class="text-sm text-muted-foreground">
        GET any Salesforce API path. POST is limited to the Data Cloud query endpoints
        (<code>ssot/query-sql</code>, <code>ssot/queryv2</code>); nothing that writes is allowed.
      </p>
    </div>
    <form class="flex gap-2" @submit.prevent="sendRequest">
      <select v-model="method" class="border rounded-md px-2 py-1 bg-background text-sm">
        <option>GET</option>
        <option>POST</option>
      </select>
      <input v-model="path" class="flex-1 border rounded-md px-2 py-1 bg-background font-mono text-sm" spellcheck="false" />
      <button class="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50" :disabled="busy || !org.orgId">
        <Send class="w-4 h-4" /> {{ busy ? 'Sending…' : 'Send' }}
      </button>
    </form>
    <textarea
      v-if="method === 'POST'" v-model="body" rows="5" spellcheck="false"
      class="w-full border rounded-md p-2 bg-background font-mono text-xs"
    />
    <div v-if="result" class="space-y-2">
      <div class="flex items-center gap-3 text-sm">
        <span :class="result.ok ? 'text-green-600' : 'text-destructive'">{{ result.status || 'no response' }}</span>
        <span class="text-muted-foreground">{{ result.ms }} ms</span>
        <label class="ml-auto flex items-center gap-1 text-muted-foreground">
          <input v-model="showShape" type="checkbox" /> Shape only (no values)
        </label>
      </div>
      <div v-if="!result.ok" class="text-sm text-destructive whitespace-pre-wrap">{{ result.error }}</div>
      <pre v-if="text" class="text-xs font-mono border rounded p-2 max-h-[70vh] overflow-auto bg-card whitespace-pre-wrap break-all">{{ text }}</pre>
    </div>
  </section>
</template>
