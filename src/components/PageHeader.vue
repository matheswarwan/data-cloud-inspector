<script setup>
// The top of a page (canvas "Option D – pages"): a tinted icon, the title with its help mark,
// a one-line description, and actions on the right.
import { computed } from 'vue'
import { CircleHelp, Settings } from 'lucide-vue-next'
import HelpTip from './HelpTip.vue'
import { NAV } from '../app/router.js'
import { navIcon, toneOf } from '../app/navIcons.js'

const props = defineProps({
  path: { type: String, required: true }, // the sidebar page: icon and colour
  title: { type: String, default: '' }, // defaults to the sidebar label
  eyebrow: { type: String, default: '' },
  topic: { type: String, default: '' }, // HelpTip topic
})
const EXTRA = { '/help': { label: 'Help', icon: CircleHelp }, '/settings': { label: 'Settings', icon: Settings } }
const nav = computed(() => NAV.find((n) => n.path === props.path))
const icon = computed(() => EXTRA[props.path]?.icon || navIcon(nav.value?.icon))
const label = computed(() => props.title || nav.value?.label || EXTRA[props.path]?.label || '')
</script>

<template>
  <header class="flex flex-wrap items-start gap-x-4 gap-y-3">
    <span :class="['w-10 h-10 mt-1 rounded-xl flex items-center justify-center shrink-0', toneOf(path)[0]]" aria-hidden="true"><component :is="icon" class="w-5 h-5" /></span>
    <div class="flex-1 min-w-60">
      <div v-if="eyebrow" class="text-xs font-semibold text-muted-foreground">{{ eyebrow }}</div>
      <h1 class="flex items-center gap-2 text-[26px] leading-8 font-bold tracking-tight">{{ label }}<HelpTip v-if="topic" :topic="topic" /></h1>
      <p v-if="$slots.default" class="mt-0.5 text-[15px] text-muted-foreground"><slot /></p>
    </div>
    <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2"><slot name="actions" /></div>
  </header>
</template>
