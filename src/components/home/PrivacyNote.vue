<script setup>
import { ShieldCheck } from 'lucide-vue-next'
</script>

<template>
  <div class="text-sm space-y-1.5">
    <div class="flex items-center gap-2 font-medium"><ShieldCheck class="w-4 h-4 text-green-600" /> Nothing is ever changed in your org</div>
    <ul class="text-muted-foreground space-y-1 list-disc pl-5">
      <li>The tool only reads, and its SQL queries only read too.</li>
      <li>It uses the Salesforce login already in this browser (or an OAuth login). The session stays inside the extension and is sent only to your own org. The extension calls nothing but Salesforce: feedback opens an email in your own mail app, and Open in Diagramforce (off unless you turn it on in Settings) hands a diagram's names, no records, to diagramforce.com.</li>
      <li>Settings, saved queries, query history and the metadata cache are kept in this browser. Bulk lookup and Compare results are kept only until the browser closes. Other records and query results are not stored. <a href="privacy.html" target="_blank" rel="noopener" class="text-link hover:underline">Privacy policy</a></li>
    </ul>
  </div>
</template>
