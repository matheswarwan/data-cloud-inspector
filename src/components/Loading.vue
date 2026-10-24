<script setup>
// What is loading, with a moving bar instead of plain "Loading…" text (feedback #119).
defineProps({ text: { type: String, default: 'Loading' } })
</script>

<template>
  <div class="flex items-center gap-3 text-sm text-muted-foreground py-1" role="status" aria-live="polite">
    <span class="relative w-24 h-1 rounded-full bg-muted overflow-hidden shrink-0" aria-hidden="true"><span class="dci-progress absolute inset-y-0 w-1/3 rounded-full bg-primary/70" /></span>
    <span>{{ text.replace(/…$/, '') }}…</span>
  </div>
</template>
