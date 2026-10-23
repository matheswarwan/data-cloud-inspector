<script setup>
// First-visit tips (feedback #103): when a page with easy-to-miss features opens for the first
// time, a card in the corner explains them one at a time and highlights them on the page.
import { ref, computed, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { X, Lightbulb } from 'lucide-vue-next'
import { HELP, unseenTips } from '../lib/help.js'
import { seenTips, markSeen, tipsOn, setTipsOn } from '../lib/tips.js'

const route = useRoute()
const queue = ref([])
const tip = computed(() => (queue.value.length ? { id: queue.value[0], ...HELP[queue.value[0]] } : null))
let timer = null

watch(() => route.path, (path) => {
  clearTimeout(timer)
  queue.value = []
  if (!tipsOn()) return
  // Wait for the page to draw, so the highlighted part is there.
  timer = setTimeout(() => { queue.value = unseenTips(path, seenTips()); highlight() }, 1200)
}, { immediate: true })

function highlight() {
  nextTick(() => {
    document.querySelectorAll('[data-help-active]').forEach((el) => el.removeAttribute('data-help-active'))
    const el = tip.value && document.querySelector(`[data-help="${tip.value.id}"]`)
    if (el) { el.setAttribute('data-help-active', ''); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }
  })
}
function next() { markSeen([queue.value[0]]); queue.value = queue.value.slice(1); highlight() }
function dismissAll() { markSeen(queue.value); queue.value = []; highlight() }
function turnOff() { setTipsOn(false); dismissAll() }
</script>

<template>
  <div v-if="tip" role="dialog" aria-live="polite" :aria-label="`Tip: ${tip.title}`" class="fixed z-40 right-4 bottom-4 w-80 border rounded-md bg-card text-foreground shadow-xl p-3 text-sm space-y-2">
    <div class="flex items-start gap-2">
      <Lightbulb class="w-4 h-4 mt-0.5 text-amber-500 shrink-0" />
      <div class="font-medium flex-1">{{ tip.title }}</div>
      <button class="p-0.5 rounded hover:bg-accent" aria-label="Close tips for this page" @click="dismissAll"><X class="w-3.5 h-3.5" /></button>
    </div>
    <p class="text-muted-foreground leading-snug">{{ tip.text }}</p>
    <div class="flex items-center gap-3 text-xs">
      <button class="text-muted-foreground hover:underline" @click="turnOff">Do not show tips</button>
      <RouterLink :to="`/help#${tip.id}`" class="text-link hover:underline" @click="dismissAll">Help</RouterLink>
      <button class="ml-auto px-2.5 py-1 rounded-md bg-primary text-primary-foreground" @click="next">{{ queue.length > 1 ? `Next tip (${queue.length - 1} more)` : 'Got it' }}</button>
    </div>
  </div>
</template>
