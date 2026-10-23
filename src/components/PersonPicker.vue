<script setup>
// Search for one source Individual (email, phone, name or ID) and pick it.
import { ref } from 'vue'
import { search } from '../lib/profile.js'

const props = defineProps({ q: { type: Function, required: true }, ruleset: { type: Object, default: null }, label: { type: String, default: 'Person' } })
const emit = defineEmits(['pick'])
const text = ref('')
const found = ref(null)
const busy = ref(false)
const error = ref('')
const picked = ref(null)

async function find() {
  if (!text.value.trim()) return
  busy.value = true
  error.value = ''
  try {
    const r = await search(props.q, text.value, props.ruleset)
    found.value = r.groups.flatMap((g) => g.sources.map((s) => ({ ...s, unifiedId: g.unifiedId })))
  } catch (err) {
    error.value = err.message
  } finally {
    busy.value = false
  }
}
function pick(p) {
  picked.value = p
  found.value = null
  emit('pick', p)
}
</script>

<template>
  <div class="space-y-1.5 text-sm">
    <div class="text-muted-foreground">{{ label }}</div>
    <div v-if="picked" class="flex items-center gap-2 border rounded-md px-2 py-1.5">
      <span class="truncate">{{ picked.name }}</span>
      <span class="font-mono text-xs text-muted-foreground truncate">{{ picked.id }}</span>
      <button class="ml-auto text-xs text-link hover:underline" @click="picked = null; emit('pick', null)">Change</button>
    </div>
    <form v-else class="flex gap-2" @submit.prevent="find">
      <input v-model="text" placeholder="Email, phone, name or ID" class="flex-1 border rounded-md px-2 py-1.5 bg-background" />
      <button class="px-2.5 py-1.5 rounded-md border hover:bg-accent disabled:opacity-50" :disabled="busy">{{ busy ? 'Finding…' : 'Find' }}</button>
    </form>
    <p v-if="error" class="text-xs text-destructive">{{ error }}</p>
    <ul v-if="found" class="border rounded-md max-h-48 overflow-auto">
      <li v-if="!found.length" class="px-2 py-1.5 text-muted-foreground">Nobody found.</li>
      <li v-for="p in found" :key="p.id">
        <button class="w-full text-left px-2 py-1.5 hover:bg-accent flex gap-2" @click="pick(p)">
          <span class="truncate">{{ p.name }}</span>
          <span class="font-mono text-xs text-muted-foreground ml-auto">{{ p.id }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>
