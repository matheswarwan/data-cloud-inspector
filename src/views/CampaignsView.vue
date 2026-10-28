<script setup>
import PageHeader from '../components/PageHeader.vue'
// Campaigns (Marketing Cloud Next, analysis doc 2026-10-27): Campaign records, and for one
// campaign its members by status and engagement counts per action from any engagement DMO
// with a campaign field. Read only.
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { RefreshCw, X, ExternalLink } from 'lucide-vue-next'
import DataTable from '../components/DataTable.vue'
import Loading from '../components/Loading.vue'
import HelpTip from '../components/HelpTip.vue'
import { useOrg, currentOrg } from '../app/useOrg.js'
import { orgCall, useCatalog, ensureCatalog } from '../app/useCatalog.js'
import { runQuery } from '../lib/query.js'
import { toObjects } from '../lib/profile.js'
import { recordUrl } from '../lib/links.js'
import { loadCampaigns, memberStatuses, campaignEngagementObjects, campaignEngagementSql } from '../lib/campaigns.js'

const org = useOrg()
const catalog = useCatalog()
const campaigns = ref([])
const loading = ref(false)
const error = ref('')
const activeOnly = ref(false)

async function load() {
  if (!org.version) return
  loading.value = true
  error.value = ''
  try { campaigns.value = await loadCampaigns(orgCall(), org.version) } catch (e) { error.value = e.message } finally { loading.value = false }
}
onMounted(() => { load(); ensureCatalog() })
watch(() => [org.orgId, org.version], load)

const shown = computed(() => (activeOnly.value ? campaigns.value.filter((c) => c.IsActive) : campaigns.value))
// Date-only values (YYYY-MM-DD) are local days, not UTC midnight.
const day = (d) => (d ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T00:00:00` : d).toLocaleDateString() : '')
const num = (n) => (n == null ? '' : Number(n).toLocaleString())
const columns = [
  { key: 'Name', label: 'Campaign' },
  { key: 'Type', label: 'Type' },
  { key: 'Status', label: 'Status', value: (c) => [c.Status, c.IsActive ? 'active' : ''].filter(Boolean).join(', ') },
  { key: 'StartDate', label: 'Dates', value: (c) => [day(c.StartDate), day(c.EndDate)].filter(Boolean).join(' to ') },
  { key: 'NumberOfContacts', label: 'Contacts', value: (c) => num(c.NumberOfContacts) },
  { key: 'NumberOfResponses', label: 'Responses', value: (c) => num(c.NumberOfResponses) },
]

const open = ref(null)
const engagementObjects = computed(() => campaignEngagementObjects(catalog.objects))
async function openCampaign(c) {
  const o = { c, members: null, membersError: '', engagement: [], loading: true }
  open.value = o
  const [members, engagement] = await Promise.all([
    memberStatuses(orgCall(), org.version, c.Id).then((m) => ({ m }), (e) => ({ e: e.message })),
    Promise.all(engagementObjects.value.map(async (e) => {
      try { return { ...e, rows: toObjects(await runQuery(orgCall(), org.version, campaignEngagementSql(e, c.Id), { rowLimit: 200 })), error: '' } } catch (err) { return { ...e, rows: [], error: err.message } }
    })),
  ])
  if (open.value?.c !== c) return
  open.value = { ...o, loading: false, members: members.m || [], membersError: members.e || '', engagement }
}
const onKey = (e) => { if (e.key === 'Escape') open.value = null }
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <section class="max-w-6xl mx-auto space-y-4">
    <div class="flex items-start gap-3">
      <div>
        <PageHeader path="/campaigns" title="Campaigns" topic="campaigns">Campaign records, their members by status and, where an engagement object records the campaign, what happened per action.</PageHeader>
      </div>
      <button class="ml-auto shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-sm hover:bg-accent disabled:opacity-50" :disabled="loading" @click="load"><RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" /> Load again</button>
    </div>
    <Loading v-if="loading && !campaigns.length" text="Reading campaigns" />
    <p v-else-if="error" class="text-sm text-destructive">{{ error }}</p>
    <template v-else>
      <label class="text-sm inline-flex items-center gap-1.5"><input v-model="activeOnly" type="checkbox" /> Active only</label>
      <DataTable :columns="columns" :rows="shown" row-key="Id" empty="No campaigns.">
        <template #cell-Name="{ row: c }"><button class="text-link hover:underline text-left" @click="openCampaign(c)">{{ c.Name }}</button></template>
      </DataTable>
    </template>

    <div v-if="open" class="fixed inset-x-0 bottom-0 top-[49px] z-20 bg-black/30" @mousedown.self="open = null">
      <aside role="dialog" :aria-label="`Campaign ${open.c.Name}`" class="absolute right-0 top-0 h-full w-[36rem] max-w-full bg-card border-l shadow-2xl flex flex-col">
        <div class="p-3 border-b flex items-start gap-2">
          <div class="min-w-0">
            <div class="font-medium truncate">{{ open.c.Name }}</div>
            <div class="text-xs text-muted-foreground">{{ [open.c.Type, open.c.Status, day(open.c.StartDate) && `${day(open.c.StartDate)} to ${day(open.c.EndDate) || 'open'}`].filter(Boolean).join(' · ') }}</div>
          </div>
          <a :href="recordUrl(currentOrg()?.host, open.c.Id)" target="_blank" rel="noopener" class="ml-auto shrink-0 inline-flex items-center gap-1 text-xs text-link hover:underline">Open in Salesforce <ExternalLink class="w-3 h-3" /></a>
          <button class="shrink-0 p-1 rounded hover:bg-accent" title="Close (Esc)" @click="open = null"><X class="w-4 h-4" /></button>
        </div>
        <div class="flex-1 min-h-0 overflow-auto p-3 text-sm space-y-4">
          <p v-if="open.c.Description" class="text-muted-foreground">{{ open.c.Description }}</p>
          <p v-if="open.loading" class="text-muted-foreground">Reading members and engagement…</p>
          <template v-else>
            <div>
              <div class="font-medium mb-1">Members by status</div>
              <p v-if="open.membersError" class="text-destructive text-xs">{{ open.membersError }}</p>
              <p v-else-if="!open.members.length" class="text-muted-foreground">No campaign members.</p>
              <ul v-else class="space-y-0.5"><li v-for="m in open.members" :key="m.status">{{ m.status }} <span class="text-muted-foreground">{{ num(m.count) }}</span></li></ul>
            </div>
            <div>
              <div class="font-medium mb-1">Engagement</div>
              <p v-if="!open.engagement.length" class="text-muted-foreground">No engagement object in this data space has a campaign field.</p>
              <div v-for="e in open.engagement" :key="e.object" class="mb-2">
                <RouterLink :to="`/objects/${e.object}`" class="font-mono text-xs text-link hover:underline">{{ e.object }}</RouterLink>
                <p v-if="e.error" class="text-xs text-destructive">{{ e.error }}</p>
                <p v-else-if="!e.rows.length || (e.rows.length === 1 && !Number(e.rows[0].n))" class="text-xs text-muted-foreground">Nothing for this campaign.</p>
                <ul v-else class="space-y-0.5"><li v-for="(r, i) in e.rows" :key="i">{{ r.action || 'Rows' }} <span class="text-muted-foreground">{{ num(r.n) }}</span></li></ul>
              </div>
            </div>
          </template>
        </div>
      </aside>
    </div>
  </section>
</template>
