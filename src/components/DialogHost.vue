<script setup>
import { ref, watch, nextTick } from 'vue'
import { useDialog } from '../app/useDialog.js'

const state = useDialog()
const value = ref('')
const input = ref(null)
const primaryBtn = ref(null)

watch(() => state.dialog, async (d) => {
  if (!d) return
  value.value = d.value || ''
  await nextTick()
  if (d.kind === 'text') { input.value?.focus(); input.value?.select() } else primaryBtn.value?.focus()
})

function ok(action = 'primary') {
  const d = state.dialog
  if (!d) return
  if (d.kind === 'text') {
    if (!value.value.trim()) return
    d.resolve({ value: value.value.trim(), action })
  } else d.resolve(true)
}
function cancel() { state.dialog?.resolve(state.dialog.kind === 'text' ? null : false) }
</script>

<template>
  <div v-if="state.dialog" class="fixed inset-0 z-[60] bg-black/40 flex items-start justify-center pt-32 px-4" @mousedown.self="cancel" @keydown.esc="cancel">
    <form class="w-full max-w-md rounded-xl border bg-card shadow-2xl" role="dialog" aria-modal="true" :aria-label="state.dialog.title" @submit.prevent="ok()">
      <h2 class="px-4 pt-4 font-medium">{{ state.dialog.title }}</h2>
      <div class="px-4 py-3 space-y-2 text-sm">
        <p v-if="state.dialog.message" class="text-muted-foreground whitespace-pre-line">{{ state.dialog.message }}</p>
        <label v-if="state.dialog.kind === 'text'" class="block space-y-1">
          <span v-if="state.dialog.label" class="text-muted-foreground">{{ state.dialog.label }}</span>
          <input ref="input" v-model="value" :placeholder="state.dialog.placeholder" maxlength="200" class="w-full border rounded-md px-2 py-1.5 bg-background" @keydown.esc.stop="cancel" />
        </label>
      </div>
      <div class="px-4 pb-4 flex justify-end gap-2">
        <button type="button" class="px-3 py-1.5 rounded-md border text-sm hover:bg-accent" @click="cancel">Cancel</button>
        <button
          v-if="state.dialog.extra" type="button" class="px-3 py-1.5 rounded-md border text-sm hover:bg-accent disabled:opacity-50"
          :disabled="state.dialog.kind === 'text' && !value.trim()" @click="ok(state.dialog.extra.id)"
        >{{ state.dialog.extra.label }}</button>
        <button
          ref="primaryBtn" type="submit"
          :class="['px-3 py-1.5 rounded-md text-sm disabled:opacity-50', state.dialog.danger ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground']"
          :disabled="state.dialog.kind === 'text' && !value.trim()"
        >{{ state.dialog.primary }}</button>
      </div>
    </form>
  </div>
</template>
