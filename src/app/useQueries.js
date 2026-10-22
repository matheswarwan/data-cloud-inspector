// Saved queries and run history, in chrome.storage.local (not per org: the same SQL
// often runs in several orgs).

import { reactive } from 'vue'
import { storeGet, storeSet } from '../lib/store.js'

const SAVED = 'dci_savedQueries'
const HISTORY = 'dci_history'
const HISTORY_MAX = 50

const state = reactive({ saved: [], history: [], loaded: false })

export async function loadQueries() {
  if (state.loaded) return
  state.saved = await storeGet(SAVED, [])
  state.history = await storeGet(HISTORY, [])
  state.loaded = true
}

export async function saveQuery({ id, name, sql }) {
  const now = new Date().toISOString()
  const existing = id && state.saved.find((q) => q.id === id)
  if (existing) Object.assign(existing, { name, sql, updatedAt: now })
  else state.saved.unshift({ id: crypto.randomUUID(), name, sql, updatedAt: now })
  await storeSet(SAVED, JSON.parse(JSON.stringify(state.saved)))
  return existing?.id || state.saved[0].id
}

export async function deleteQuery(id) {
  state.saved = state.saved.filter((q) => q.id !== id)
  await storeSet(SAVED, JSON.parse(JSON.stringify(state.saved)))
}

export async function addHistory({ sql, host, rows, error }) {
  const entry = { sql, host, rows, error: error || '', at: new Date().toISOString() }
  state.history = [entry, ...state.history.filter((h) => h.sql !== sql)].slice(0, HISTORY_MAX)
  await storeSet(HISTORY, JSON.parse(JSON.stringify(state.history)))
}

export function useQueries() {
  return state
}
