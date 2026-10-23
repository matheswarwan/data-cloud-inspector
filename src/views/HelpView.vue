<script setup>
// Help (feedback #103): what each page and feature does, grouped; links open the page.
import { onMounted, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { HELP, HELP_GROUPS } from '../lib/help.js'
import { resetTips, setTipsOn } from '../lib/tips.js'

const route = useRoute()
function scrollToHash() {
  nextTick(() => { const id = route.hash.slice(1); if (id) document.getElementById(`help-${id}`)?.scrollIntoView({ block: 'start' }) })
}
onMounted(scrollToHash)
watch(() => route.hash, scrollToHash)
const showTipsAgain = () => { setTipsOn(true); resetTips() }
</script>

<template>
  <section class="max-w-3xl mx-auto space-y-6 pb-10">
    <div>
      <h2 class="text-lg font-semibold">Help</h2>
      <p class="text-sm text-muted-foreground">What each page of Data Cloud Inspector does. The question mark next to a heading explains that part of the page; pages with features that are easy to miss show tips the first time you open them (<button class="text-link hover:underline" @click="showTipsAgain">show all tips again</button>).</p>
    </div>
    <div v-for="g in HELP_GROUPS" :key="g.title" class="space-y-3">
      <h3 class="font-medium border-b pb-1">{{ g.title }}</h3>
      <div v-for="id in g.ids" :id="`help-${id}`" :key="id" :class="['scroll-mt-16 rounded-md p-2 -m-2', route.hash === `#${id}` ? 'bg-accent' : '']">
        <div class="flex items-baseline gap-2">
          <h4 class="text-sm font-medium">{{ HELP[id].title }}</h4>
          <RouterLink v-if="HELP[id].page" :to="HELP[id].page" class="text-xs text-link hover:underline">Open</RouterLink>
        </div>
        <p class="text-sm text-muted-foreground">{{ HELP[id].text }}</p>
      </div>
    </div>
  </section>
</template>
