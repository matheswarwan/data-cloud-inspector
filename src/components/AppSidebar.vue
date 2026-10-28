<script setup>
// Left sidebar (feedback #95, as in Marketing Cloud Toolkit): the pages in groups with
// dividers, a dot for background jobs, and a collapse to icons only (remembered).
import { ref, watch } from 'vue'
import { Settings, CircleHelp, PanelLeftOpen, PanelLeftClose } from 'lucide-vue-next'
import { navIcon as icon } from '../app/navIcons.js'
import { NAV } from '../app/router.js'
import { jobBadge } from '../app/useJobs.js'

const KEY = 'dci_sidebarCollapsed'
const read = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } }
const collapsed = ref(read())
watch(collapsed, (v) => { try { localStorage.setItem(KEY, v ? '1' : '0') } catch { /* private window */ } })
// At the bottom, like the SFMC Toolkit (feedback #107).
const FOOTER = [{ path: '/help', label: 'Help', icon: CircleHelp }, { path: '/settings', label: 'Settings', icon: Settings }]
</script>

<template>
  <aside :class="['shrink-0 border-r bg-card sticky top-[49px] h-[calc(100vh-49px)] overflow-hidden py-2 flex flex-col', collapsed ? 'w-12' : 'w-52']" aria-label="Pages">
    <!-- Only the page list scrolls, so Help, Settings, Collapse and the credit stay in view. -->
    <nav class="flex-1 min-h-0 overflow-y-auto px-1.5 space-y-0.5">
      <template v-for="(item, i) in NAV" :key="item.path">
        <div v-if="i && item.group !== NAV[i - 1].group" class="my-2 border-t" role="separator" />
        <RouterLink
          :to="item.path" :title="collapsed ? item.label : ''"
          class="flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          active-class="bg-accent text-foreground font-medium"
        >
          <component :is="icon(item.icon)" class="w-4 h-4 shrink-0" />
          <span v-if="!collapsed" class="truncate">{{ item.label }}</span>
          <span
            v-if="item.job && jobBadge(item.job)"
            :class="['w-1.5 h-1.5 rounded-full shrink-0', collapsed ? '-ml-2 -mt-3' : 'ml-auto', jobBadge(item.job) === 'running' ? 'bg-sky-500 animate-pulse' : 'bg-amber-500']"
            :title="jobBadge(item.job) === 'running' ? 'Running in the background' : 'Finished: results waiting'"
          />
        </RouterLink>
      </template>
    </nav>
    <div class="shrink-0 mt-2 pt-2 border-t mx-1.5 space-y-0.5">
      <RouterLink
        v-for="f in FOOTER" :key="f.path" :to="f.path" :title="collapsed ? f.label : undefined"
        class="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-foreground/80 hover:bg-accent" active-class="bg-accent text-foreground font-medium"
      >
        <component :is="f.icon" class="w-4 h-4 shrink-0" />
        <span v-if="!collapsed">{{ f.label }}</span>
      </RouterLink>
    </div>
    <button class="shrink-0 mx-1.5 mt-0.5 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-accent flex items-center gap-2" :title="collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'" @click="collapsed = !collapsed">
      <component :is="collapsed ? PanelLeftOpen : PanelLeftClose" class="w-4 h-4" />
      <span v-if="!collapsed">Collapse</span>
    </button>
    <p v-if="!collapsed" class="shrink-0 mx-1.5 mt-1 px-2 text-[11px] text-muted-foreground">Created by <a href="https://www.linkedin.com/in/mathesk/" target="_blank" rel="noopener" class="hover:underline">Mathes</a>, Ateko</p>
  </aside>
</template>
