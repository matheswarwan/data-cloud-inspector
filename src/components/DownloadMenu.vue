<script setup>
// Download menu (as in Marketing Cloud Toolkit): View, Copy and download as Markdown, Word,
// PDF and HTML, plus Excel when the screen provides sheets. `getMarkdown` (or `getDoc`) may
// fetch; Markdown is read back into a document for Word, PDF and HTML.
import { ref } from 'vue'
import { Download, ChevronDown } from 'lucide-vue-next'
import MarkdownModal from './MarkdownModal.vue'
import { toMarkdown, toHtml, toDocxBlob, saveBlob, safeFileName, markdownToDoc, printDoc, downloadWorkbook } from '../lib/exportDoc.js'

const props = defineProps({
  getMarkdown: { type: Function, default: null },
  getDoc: { type: Function, default: null },
  getSheets: { type: Function, default: null },
  fileName: { type: String, default: 'export' },
  label: { type: String, default: 'Download' },
  disabled: { type: Boolean, default: false },
  small: { type: Boolean, default: false },
})
const open = ref(false)
const busy = ref(false)
const viewing = ref(null)
const note = ref('')

async function material() {
  if (props.getDoc) {
    const doc = await props.getDoc()
    return { doc, md: toMarkdown(doc) }
  }
  const md = await props.getMarkdown()
  return { doc: markdownToDoc(md, props.fileName), md }
}

async function run(kind) {
  open.value = false
  busy.value = true
  note.value = ''
  const base = `${safeFileName(props.fileName)}-${new Date().toISOString().slice(0, 10)}`
  try {
    if (kind === 'xlsx') { await downloadWorkbook(await props.getSheets(), `${base}.xlsx`); return }
    const { doc, md } = await material()
    if (kind === 'view') viewing.value = { title: doc.title, text: md, base }
    else if (kind === 'copy') { await navigator.clipboard.writeText(md); note.value = 'Copied.' }
    else if (kind === 'md') saveBlob(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `${base}.md`)
    else if (kind === 'docx') saveBlob(await toDocxBlob(doc), `${base}.docx`)
    else if (kind === 'html') saveBlob(new Blob([toHtml(doc)], { type: 'text/html;charset=utf-8' }), `${base}.html`)
    else if (kind === 'pdf') printDoc(doc)
  } catch (err) {
    note.value = `Could not export: ${err.message}`
  } finally {
    busy.value = false
    if (note.value) setTimeout(() => { note.value = '' }, 2500)
  }
}

const ITEMS = [
  { kind: 'view', label: 'View as Markdown' },
  { kind: 'copy', label: 'Copy as Markdown' },
  { kind: 'md', label: 'Markdown (.md)' },
  { kind: 'docx', label: 'Word (.docx)' },
  { kind: 'pdf', label: 'PDF (print, Save as PDF)' },
  { kind: 'html', label: 'HTML (.html)' },
]
</script>

<template>
  <div class="relative inline-block">
    <button :class="small ? (label ? 'dci-btn dci-btn-sm' : 'dci-btn-icon dci-btn-sm') : 'dci-btn'" :disabled="disabled || busy" :aria-expanded="open" :title="label ? undefined : 'Download'" :aria-label="label ? undefined : 'Download'" @click="open = !open">
      <Download :class="small ? 'w-3.5 h-3.5' : 'w-4 h-4'" />{{ busy ? 'Preparing…' : note || label }}<ChevronDown class="w-3.5 h-3.5 text-muted-foreground" />
    </button>
    <template v-if="open">
      <div class="fixed inset-0 z-40" @click="open = false" />
      <div class="absolute right-0 mt-1 w-56 z-50 rounded-xl border bg-card shadow-lg py-1" role="menu">
        <button v-for="item in ITEMS" :key="item.kind" role="menuitem" class="w-full text-left px-3 py-1.5 text-sm hover:bg-accent" @click="run(item.kind)">{{ item.label }}</button>
        <button v-if="getSheets" role="menuitem" class="w-full text-left px-3 py-1.5 text-sm hover:bg-accent border-t" @click="run('xlsx')">Excel (.xlsx)</button>
      </div>
    </template>
    <MarkdownModal v-if="viewing" :title="viewing.title" :text="viewing.text" :file-base="viewing.base" @close="viewing = null" />
  </div>
</template>
