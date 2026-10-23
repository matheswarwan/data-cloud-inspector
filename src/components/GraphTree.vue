<script setup>
// One level of a data graph's object tree.
defineProps({ nodes: { type: Array, default: () => [] } })
</script>

<template>
  <ul class="pl-4 border-l space-y-1">
    <li v-for="n in nodes" :key="n.via + n.name">
      <RouterLink :to="`/objects/${n.name}`" class="font-mono text-xs text-link hover:underline">{{ n.name }}</RouterLink>
      <span v-if="n.fields.length" class="text-xs text-muted-foreground"> · {{ n.fields.length }} fields: {{ n.fields.slice(0, 8).join(', ') }}{{ n.fields.length > 8 ? ', …' : '' }}</span>
      <GraphTree v-if="n.children.length" :nodes="n.children" />
    </li>
  </ul>
</template>
