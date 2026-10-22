<script setup>
// CodeMirror 6 with the PostgreSQL dialect (Data Cloud SQL is close to it), table and
// field autocomplete from the org's metadata, and Ctrl/Cmd+Enter to run.
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { EditorView, basicSetup } from 'codemirror'
import { keymap, Decoration } from '@codemirror/view'
import { EditorState, Compartment, Prec, StateEffect, StateField } from '@codemirror/state'
import { sql, PostgreSQL } from '@codemirror/lang-sql'
import { oneDark } from '@codemirror/theme-one-dark'
import { useSettings } from '../app/useSettings.js'

const props = defineProps({
  modelValue: { type: String, default: '' },
  schema: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['update:modelValue', 'run'])

const host = ref(null)
let view = null
const language = new Compartment()
const theme = new Compartment()
const settings = useSettings()

// Inserted text is highlighted for a moment so it is clear where it went (feedback #87).
const flashEffect = StateEffect.define()
const clearFlash = StateEffect.define()
const flashMark = Decoration.mark({ class: 'cm-dci-inserted' })
const flashField = StateField.define({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes)
    for (const e of tr.effects) {
      if (e.is(flashEffect)) deco = Decoration.set([flashMark.range(e.value.from, e.value.to)])
      if (e.is(clearFlash)) deco = Decoration.none
    }
    return deco
  },
  provide: (f) => EditorView.decorations.from(f),
})
let flashTimer = null

const lang = () => sql({ dialect: PostgreSQL, schema: props.schema, upperCaseKeywords: true })
const themeExt = () => (settings.dark ? oneDark : [])

onMounted(() => {
  view = new EditorView({
    parent: host.value,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        basicSetup,
        language.of(lang()),
        theme.of(themeExt()),
        EditorView.lineWrapping,
        flashField,
        Prec.highest(keymap.of([{ key: 'Mod-Enter', run: () => { emit('run', selection()); return true } }])),
        EditorView.updateListener.of((u) => { if (u.docChanged) emit('update:modelValue', u.state.doc.toString()) }),
        EditorView.theme({ '&': { fontSize: '13px', height: '100%' }, '.cm-scroller': { fontFamily: "'JetBrains Mono', 'Fira Code', monospace" } }),
      ],
    }),
  })
})

onBeforeUnmount(() => {
  clearTimeout(flashTimer)
  view?.destroy()
})

watch(() => props.modelValue, (v) => {
  if (view && v !== view.state.doc.toString()) {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: v } })
  }
})
watch(() => props.schema, () => view?.dispatch({ effects: language.reconfigure(lang()) }))
watch(() => settings.dark, () => view?.dispatch({ effects: theme.reconfigure(themeExt()) }))

/** The selected text, or '' when nothing is selected. */
function selection() {
  const { from, to } = view.state.selection.main
  return from === to ? '' : view.state.sliceDoc(from, to)
}

/** Puts text at the cursor (replacing any selection) and keeps the editor focused. */
function insert(text) {
  if (!view) return
  const { from, to } = view.state.selection.main
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length },
    effects: [flashEffect.of({ from, to: from + text.length }), EditorView.scrollIntoView(from, { y: 'center' })],
  })
  view.focus()
  clearTimeout(flashTimer)
  flashTimer = setTimeout(() => view?.dispatch({ effects: clearFlash.of(null) }), 2200)
}

defineExpose({ selection, insert, focus: () => view?.focus() })
</script>

<template>
  <div ref="host" class="h-full border rounded-md overflow-hidden bg-card" />
</template>
