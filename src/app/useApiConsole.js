// The API console (feedback #115, like the Marketing Cloud Toolkit's): every Salesforce call the
// page makes, with its request and response, while it is turned on in Settings. In memory only,
// the last MAX calls; nothing is stored or sent.
import { ref, shallowRef } from 'vue'
import { setApiListener } from '../lib/api.js'

const KEY = 'dci_apiConsole'
const MAX = 200
const read = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } }

const enabled = ref(read())
const calls = shallowRef([])
let seq = 0

function listen(on) {
  setApiListener(on ? (entry) => { calls.value = [{ id: ++seq, ...entry }, ...calls.value].slice(0, MAX) } : null)
}
listen(enabled.value)

export function setApiConsole(on) {
  enabled.value = on
  try { if (on) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY) } catch { /* private window */ }
  listen(on)
  if (!on) calls.value = []
}

export function clearApiConsole() { calls.value = [] }

/** The calls as Markdown, oldest first, for a bug report or an AI chat. */
export function apiConsoleMarkdown(list, { maxChars = 4000 } = {}) {
  const cut = (v) => { const t = typeof v === 'string' ? v : JSON.stringify(v, null, 2) ?? ''; return t.length > maxChars ? `${t.slice(0, maxChars)}\n… (${t.length - maxChars} more characters)` : t }
  const out = ['# Data Cloud Inspector API calls', '']
  for (const c of [...list].reverse()) {
    out.push(`## ${c.method} ${c.path}`, '', `${new Date(c.at).toISOString()} · ${c.status || 'no response'} · ${c.ms} ms`, '')
    if (c.body != null) out.push('Request body:', '', '```json', cut(c.body), '```', '')
    if (c.error) out.push('Error:', '', '```text', c.error, '```', '')
    else if (c.data !== undefined) out.push('Response:', '', '```json', cut(c.data), '```', '')
  }
  return `${out.join('\n')}\n`
}

export function useApiConsole() {
  return { enabled, calls }
}
