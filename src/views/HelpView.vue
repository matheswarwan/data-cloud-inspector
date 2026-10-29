<script setup>
import PageHeader from '../components/PageHeader.vue'
// Help (feedback #103): what each page and feature does, grouped; links open the page.
import { ref, onMounted, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { HELP, HELP_GROUPS } from '../lib/help.js'
import { resetTips, setTipsOn } from '../lib/tips.js'
// What changed in each version (feedback #1040), from CHANGELOG.md at build time.
import changelogMd from '../../CHANGELOG.md?raw'
import { parseChangelog } from '../lib/changelog.js'

const changelog = parseChangelog(changelogMd)
const allVersions = ref(false)

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
      <PageHeader path="/help" title="Help">What each page of Data Cloud Inspector does. The question mark next to a heading explains that part of the page; pages with features that are easy to miss show tips the first time you open them (<button class="text-link hover:underline" @click="showTipsAgain">show all tips again</button>). <RouterLink to="/help#changes" class="text-link hover:underline">What changed in each version</RouterLink>.</PageHeader>
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
    <div id="help-changes" class="scroll-mt-16 space-y-3">
      <h3 class="font-medium border-b pb-1">What changed in each version</h3>
      <p v-for="(b, i) in changelog.intro" :key="i" class="text-sm text-muted-foreground" v-html="b.html" />
      <div v-for="(sec, n) in (allVersions ? changelog.sections : changelog.sections.slice(0, 3))" :key="sec.title" :class="['rounded-md p-2 -m-2 space-y-1.5', n === 0 && route.hash === '#changes' ? 'bg-accent' : '']">
        <h4 class="text-sm font-medium">{{ sec.title }}</h4>
        <template v-for="(b, i) in sec.blocks" :key="i">
          <p v-if="b.type === 'p'" class="text-sm text-muted-foreground" v-html="b.html" />
          <ul v-else class="list-disc pl-5 text-sm text-muted-foreground space-y-0.5"><li v-for="(it, j) in b.items" :key="j" v-html="it" /></ul>
        </template>
      </div>
      <button v-if="changelog.sections.length > 3" class="text-xs text-link hover:underline" @click="allVersions = !allVersions">{{ allVersions ? 'Show fewer versions' : `Show all ${changelog.sections.length} versions` }}</button>
    </div>
    <p class="text-xs text-muted-foreground border-t pt-3">Created by <a href="https://www.linkedin.com/in/mathesk/" target="_blank" rel="noopener" class="text-link hover:underline">Mathes</a>, Ateko. <a href="privacy.html" target="_blank" rel="noopener" class="text-link hover:underline">Privacy policy</a></p>
  </section>
</template>
