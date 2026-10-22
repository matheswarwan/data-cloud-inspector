<script setup>
// A value that is a Salesforce record ID (segment, stream, Contact, ...) becomes a link to
// its page in the org; anything else is shown as text.
import { computed } from 'vue'
import { currentOrg } from '../app/useOrg.js'
import { recordKind, recordUrl } from '../lib/links.js'

const props = defineProps({ value: { default: null } })
const text = computed(() => (props.value == null ? '' : typeof props.value === 'object' ? JSON.stringify(props.value) : String(props.value)))
const kind = computed(() => recordKind(props.value))
const url = computed(() => (kind.value ? recordUrl(currentOrg()?.host, text.value) : null))
</script>

<template>
  <a v-if="url" :href="url" target="_blank" rel="noopener" class="text-link hover:underline" :title="`Open this ${kind.toLowerCase()} in Salesforce`">{{ text }}</a>
  <template v-else>{{ text }}</template>
</template>
