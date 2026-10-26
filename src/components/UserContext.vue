<script setup>
// The user and org the tool runs as (feedback #84; on Home too since #1004).
import { ref } from 'vue'
import Loading from './Loading.vue'
import RecordLink from './RecordLink.vue'
import { useOrg, orgTitle } from '../app/useOrg.js'
import { useUserContext } from '../app/useUserContext.js'

defineProps({ compact: { type: Boolean, default: false } })
const org = useOrg()
const user = useUserContext()
const showAllSets = ref(false)
</script>

<template>
  <p v-if="user.error" class="text-sm text-destructive">{{ user.error }}</p>
  <Loading v-else-if="!user.ctx" text="Loading…" />
  <div v-else class="space-y-3 text-sm">
    <dl class="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1">
      <dt class="text-muted-foreground">Running as</dt><dd><strong>{{ user.ctx.name }}</strong></dd>
      <dt class="text-muted-foreground">Username</dt><dd class="break-all">{{ user.ctx.username }}</dd>
      <template v-if="user.ctx.email && user.ctx.email !== user.ctx.username"><dt class="text-muted-foreground">Email</dt><dd class="break-all">{{ user.ctx.email }}</dd></template>
      <template v-if="!compact"><dt class="text-muted-foreground">User ID</dt><dd class="font-mono text-xs"><RecordLink :value="user.ctx.id" /></dd></template>
      <dt class="text-muted-foreground">Profile</dt><dd>{{ user.ctx.profile || 'unknown' }}</dd>
      <template v-if="user.ctx.role"><dt class="text-muted-foreground">Role</dt><dd>{{ user.ctx.role }}</dd></template>
      <dt class="text-muted-foreground">User type</dt><dd>{{ user.ctx.userType }}</dd>
      <template v-if="user.ctx.timeZone"><dt class="text-muted-foreground">Time zone</dt><dd>{{ user.ctx.timeZone }}</dd></template>
      <dt class="text-muted-foreground">Org</dt><dd>{{ orgTitle(org.orgId) }}</dd>
      <dt class="text-muted-foreground">Org ID</dt><dd class="font-mono text-xs">{{ user.ctx.org.id }}</dd>
      <dt class="text-muted-foreground">Edition</dt><dd>{{ user.ctx.org.type }}, {{ user.ctx.org.sandbox ? 'sandbox' : 'production' }}{{ user.ctx.org.instance ? ` (${user.ctx.org.instance})` : '' }}</dd>
    </dl>
    <div>
      <div class="text-muted-foreground">Data Cloud related permission sets ({{ user.ctx.dataCloudSets.length }})</div>
      <p v-if="!user.ctx.dataCloudSets.length" class="text-xs text-muted-foreground">None by name; access may come from the profile or a permission set group.</p>
      <ul class="text-xs flex flex-wrap gap-1 mt-1">
        <li v-for="p in user.ctx.dataCloudSets" :key="p" class="px-1.5 py-0.5 rounded bg-muted">{{ p }}</li>
      </ul>
      <button v-if="user.ctx.permissionSets.length" class="text-xs text-link hover:underline mt-1" @click="showAllSets = !showAllSets">
        {{ showAllSets ? 'Hide' : 'Show' }} all {{ user.ctx.permissionSets.length }} permission sets
      </button>
      <ul v-if="showAllSets" class="text-xs flex flex-wrap gap-1 mt-1">
        <li v-for="p in user.ctx.permissionSets" :key="p" class="px-1.5 py-0.5 rounded bg-muted">{{ p }}</li>
      </ul>
    </div>
  </div>
</template>
