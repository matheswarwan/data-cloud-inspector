<script setup>
// Log in with OAuth, for orgs that reject the browser session (API Access Control). In
// Settings and on Home (feedback #1021).
import { ref, watch } from 'vue'
import { useOrg, currentOrg, recheckOrg, orgName } from '../app/useOrg.js'
import { send } from '../lib/api.js'

defineProps({ compact: { type: Boolean, default: false } })
const org = useOrg()
const oauth = ref(null) // { active, since, clientId, redirectUri }
const clientId = ref('')
const busy = ref(false)
const msg = ref('')
const when = (iso) => (iso ? new Date(iso).toLocaleString() : '')
async function load() {
  if (!org.orgId) { oauth.value = null; return }
  oauth.value = await send({ type: 'OAUTH_STATUS', orgId: org.orgId })
  if (!clientId.value) clientId.value = oauth.value?.clientId || ''
}
async function login() {
  busy.value = true
  msg.value = ''
  const res = await send({ type: 'OAUTH_LOGIN', orgId: org.orgId, clientId: clientId.value })
  busy.value = false
  msg.value = res?.ok ? `Logged in with OAuth${res.scope ? ` (scopes: ${res.scope})` : ''}. Calls to this org now use the OAuth token until the browser closes.` : `Could not log in: ${res?.error || 'no answer'}`
  await load()
  if (res?.ok) recheckOrg()
}
async function logout() {
  await send({ type: 'OAUTH_LOGOUT', orgId: org.orgId })
  msg.value = 'Logged out of OAuth; calls use the browser session again.'
  await load()
  recheckOrg()
}
watch(() => org.orgId, () => { clientId.value = ''; msg.value = ''; load() }, { immediate: true })
defineExpose({ load })
</script>

<template>
  <div class="space-y-2">
    <p class="text-sm text-muted-foreground">
      Only needed when an org rejects the browser session, usually because API Access Control is on.
      It uses an External Client App in that org, so an admin has to create one first.
    </p>
    <template v-if="org.orgId && oauth">
      <p class="text-sm">For <strong :title="currentOrg()?.host">{{ orgName(org.orgId) }}</strong>: {{ oauth.active ? `logged in with OAuth since ${when(oauth.since)}` : 'using the browser session' }}.</p>
      <ol class="text-sm list-decimal pl-5 space-y-1">
        <li>In the org's Setup, create an External Client App with OAuth enabled, the API scope and the Data Cloud scopes (their names start with cdp_), and PKCE required.</li>
        <li>Callback URL: <code class="text-xs break-all select-all">{{ oauth.redirectUri }}</code></li>
        <li>Paste its consumer key (client ID) here and log in. The token is kept until the browser closes.</li>
      </ol>
      <div class="flex flex-wrap gap-2">
        <input v-model="clientId" placeholder="Client ID (consumer key)" aria-label="Client ID (consumer key)" class="flex-1 min-w-64 border rounded-md px-2 py-1 bg-background text-sm font-mono" />
        <button class="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50" :disabled="busy || !clientId.trim()" @click="login">{{ busy ? 'Waiting for login…' : 'Log in with OAuth' }}</button>
        <button v-if="oauth.active" class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-sm hover:bg-accent" @click="logout">Log out of OAuth</button>
      </div>
      <p v-if="msg" class="text-sm">{{ msg }}</p>
    </template>
    <p v-else class="text-sm text-muted-foreground">No org selected.</p>
  </div>
</template>
