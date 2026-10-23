// In-page dialogs instead of the browser's prompt() and confirm() (feedback #92). One dialog
// at a time, shown by DialogHost in App.vue; each call returns a promise.

import { reactive } from 'vue'

const state = reactive({ dialog: null })

function open(dialog) {
  return new Promise((resolve) => {
    state.dialog = { ...dialog, resolve: (v) => { state.dialog = null; resolve(v) } }
  })
}

/**
 * Asks for a text value. Resolves `{ value, action }` (action is 'primary' or the id of an
 * extra button), or null when cancelled.
 */
export function askText({ title, label = '', value = '', placeholder = '', primary = 'OK', extra = null, message = '' }) {
  return open({ kind: 'text', title, label, value, placeholder, primary, extra, message })
}

/** Asks yes or no. Resolves true or false. */
export function askConfirm({ title, message = '', primary = 'OK', danger = false }) {
  return open({ kind: 'confirm', title, message, primary, danger }).then((v) => !!v)
}

export function useDialog() {
  return state
}
