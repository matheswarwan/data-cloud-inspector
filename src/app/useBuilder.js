// The Query Builder's model, kept while you visit other pages (not saved across reloads:
// save the SQL in a SQL tab for that).
import { reactive } from 'vue'
import { emptyModel } from '../lib/queryBuilder.js'

const state = reactive({ model: emptyModel(), orgKey: '' })

export function useBuilder(orgKey) {
  if (state.orgKey !== orgKey) Object.assign(state, { model: emptyModel(), orgKey })
  return state
}
