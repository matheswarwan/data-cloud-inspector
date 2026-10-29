<script setup>
// People (feedback #1056): Profiles and Bulk lookup are one page with two tabs, One person
// (/profile) and A list (/bulk). Both addresses still open their tab.
import { useRoute } from 'vue-router'
import { isOn } from '../lib/features.js'

const route = useRoute()
const tabs = [
  { to: '/profile', label: 'One person', show: isOn('profiles') },
  { to: '/bulk', label: 'A list (up to 1,000)', show: isOn('bulk') },
].filter((t) => t.show)
const active = (t) => route.path === t.to || route.path.startsWith(`${t.to}/`)
</script>

<template>
  <nav v-if="tabs.length > 1" class="dci-tabs" aria-label="People">
    <RouterLink v-for="t in tabs" :key="t.to" :to="t.to" :class="['dci-tab', active(t) ? 'is-on' : '']" :aria-current="active(t) ? 'page' : undefined">{{ t.label }}</RouterLink>
  </nav>
</template>
