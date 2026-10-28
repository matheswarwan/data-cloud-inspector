<script setup>
// Every page of the tool by sidebar group, with what it does.
import { computed } from 'vue'
import { NAV } from '../../app/router.js'
import { HELP } from '../../lib/help.js'
import { PAGE_TOPIC } from '../../app/navIcons.js'

const groups = computed(() => {
  const out = new Map()
  for (const n of NAV.filter((x) => x.path !== '/')) (out.get(n.group) || out.set(n.group, []).get(n.group)).push(n)
  return [...out.values()]
})
</script>

<template>
  <div class="space-y-2">
    <RouterLink to="/help" class="text-xs text-link hover:underline">Help</RouterLink>
    <div class="grid md:grid-cols-2 gap-3 items-start">
      <div v-for="(g, gi) in groups" :key="gi" class="border rounded-xl bg-card divide-y">
        <RouterLink v-for="n in g" :key="n.path" :to="n.path" class="block px-3 py-2 hover:bg-accent">
          <div class="text-sm">{{ n.label }}</div>
          <p class="text-xs text-muted-foreground line-clamp-2">{{ HELP[PAGE_TOPIC[n.path]]?.text }}</p>
        </RouterLink>
      </div>
    </div>
  </div>
</template>
