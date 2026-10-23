<script setup>
// Read-only SQL with highlighting, line numbers, folding and search (Ctrl/Cmd+F), in the same
// editor as the SQL page (feedback #102). Follows the light or dark theme.
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState, Compartment } from '@codemirror/state'
import { sql, PostgreSQL } from '@codemirror/lang-sql'
import { oneDark } from '@codemirror/theme-one-dark'
import { useSettings } from '../app/useSettings.js'

const props = defineProps({
  code: { type: String, default: '' },
  // Classes for the box, e.g. a max height (the editor scrolls inside it).
  boxClass: { type: String, default: 'max-h-[70vh]' },
  wrap: { type: Boolean, default: true },
})

const host = ref(null)
let view = null
const theme = new Compartment()
const settings = useSettings()
const themeExt = () => (settings.dark ? oneDark : [])

onMounted(() => {
  view = new EditorView({
    parent: host.value,
    state: EditorState.create({
      doc: props.code,
      extensions: [
        basicSetup,
        sql({ dialect: PostgreSQL, upperCaseKeywords: true }),
        theme.of(themeExt()),
        EditorState.readOnly.of(true),
        props.wrap ? EditorView.lineWrapping : [],
        EditorView.theme({ '&': { fontSize: '12px' }, '.cm-scroller': { fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }, '&.cm-focused': { outline: 'none' } }),
      ],
    }),
  })
})
onBeforeUnmount(() => view?.destroy())
watch(() => props.code, (v) => { if (view && v !== view.state.doc.toString()) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: v } }) })
watch(() => settings.dark, () => view?.dispatch({ effects: theme.reconfigure(themeExt()) }))
</script>

<template>
  <div ref="host" :class="['dci-sql-block border rounded-md overflow-auto bg-card text-left', boxClass]" data-sql-block />
</template>
