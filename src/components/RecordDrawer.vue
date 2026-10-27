<script setup>
// A record shown in the extension (feedback #1009): its fields, other records named,
// the raw JSON, and a link to the record in Salesforce.
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { X, ExternalLink } from 'lucide-vue-next'
import JsonViewer from './JsonViewer.vue'

defineProps({
  title: { type: String, default: '' },
  type: { type: String, default: '' },
  link: { type: String, default: '' },
  rows: { type: Array, default: () => [] },
  record: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
})
const emit = defineEmits(['close'])
const showRaw = ref(false)
const showEmpty = ref(false)
const onKey = (e) => { if (e.key === 'Escape') emit('close') }
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="fixed inset-0 z-50 bg-black/30" @mousedown.self="emit('close')">
    <aside role="dialog" :aria-label="`${type} ${title}`" class="absolute right-0 top-0 h-full w-[34rem] max-w-full bg-card border-l shadow-2xl flex flex-col">
      <div class="p-3 border-b flex items-start gap-2">
        <div class="min-w-0">
          <div class="font-medium truncate">{{ title }}</div>
          <div class="text-xs text-muted-foreground">{{ type }}</div>
        </div>
        <a v-if="link" :href="link" target="_blank" rel="noopener" class="ml-auto shrink-0 inline-flex items-center gap-1 text-xs text-link hover:underline">Open in Salesforce <ExternalLink class="w-3 h-3" /></a>
        <button class="shrink-0 p-1 rounded hover:bg-accent" :class="link ? '' : 'ml-auto'" title="Close (Esc)" @click="emit('close')"><X class="w-4 h-4" /></button>
      </div>
      <div class="flex-1 min-h-0 overflow-auto p-3 text-sm space-y-3">
        <p v-if="loading" class="text-muted-foreground">Loading the record…</p>
        <p v-else-if="error" class="text-destructive">{{ error }}</p>
        <template v-else>
          <table class="w-full text-xs">
            <tbody>
              <tr v-for="r in rows.filter((x) => showEmpty || x.value !== '')" :key="r.field" class="border-b last:border-0 align-top">
                <td class="py-1 pr-3 font-mono text-muted-foreground whitespace-nowrap">{{ r.field }}</td>
                <td class="py-1 break-all">{{ r.value }}<div v-if="r.name" class="text-muted-foreground">{{ r.name }}</div></td>
              </tr>
            </tbody>
          </table>
          <div class="flex gap-3 text-xs">
            <button v-if="rows.some((x) => x.value === '')" class="text-link hover:underline" @click="showEmpty = !showEmpty">{{ showEmpty ? 'Hide' : 'Show' }} empty fields ({{ rows.filter((x) => x.value === '').length }})</button>
            <button class="text-link hover:underline" @click="showRaw = !showRaw">{{ showRaw ? 'Hide' : 'Show' }} raw JSON</button>
          </div>
          <JsonViewer v-if="showRaw && record" :value="record" :file-name="`${type}-${record.Id}`" />
        </template>
      </div>
    </aside>
  </div>
</template>
