// Maximize for any card (feedback #1068, after People's sections #1066). `v-expand` on a card adds
// a Maximize button to its header: the element marked `data-expand-slot`, else the card's first
// child. `v-expand.float` puts the button in the card's top-right corner instead. While maximized
// the card fills the window over a backdrop; Esc, a click on the backdrop or the button restores it.
// State lives in data attributes, not classes, so Vue's own class updates never undo it.

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
const MAX_ICON = svg('<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" x2="14" y1="3" y2="10"/><line x1="3" x2="10" y1="21" y2="14"/>')
const MIN_ICON = svg('<polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" x2="21" y1="10" y2="3"/><line x1="3" x2="10" y1="21" y2="14"/>')

let open = null // the one maximized card's state

/** Where the button goes: the marked slot, else the first child (the header), else the card. */
export function slotFor(el, float) {
  if (float) return el
  return el.querySelector('[data-expand-slot]') || el.firstElementChild || el
}

/** A short name for the dialog: the binding's value, else the header's text. */
export function cardTitle(el, value) {
  if (typeof value === 'string' && value) return value
  const head = el.querySelector('h1, h2, h3, h4') || el.firstElementChild
  return (head?.textContent || 'Card').replace(/\s+/g, ' ').trim().slice(0, 80)
}

function paint(s) {
  const on = !!s.backdrop
  s.btn.innerHTML = on ? MIN_ICON : MAX_ICON
  s.btn.setAttribute('aria-pressed', String(on))
  s.btn.setAttribute('aria-label', on ? 'Restore' : 'Maximize')
  s.btn.title = on ? 'Restore (Esc)' : 'Maximize'
}

function close(s) {
  if (!s.backdrop) return
  s.backdrop.remove(); s.backdrop = null
  for (const a of ['data-dci-max', 'role', 'aria-modal', 'aria-label']) s.el.removeAttribute(a)
  window.removeEventListener('keydown', s.onKey)
  document.documentElement.style.overflow = s.overflow || ''
  if (open === s) open = null
  paint(s)
}

function maximize(s) {
  if (open && open !== s) close(open)
  open = s
  s.backdrop = document.createElement('div')
  s.backdrop.className = 'dci-expand-backdrop'
  s.backdrop.setAttribute('aria-hidden', 'true')
  s.backdrop.addEventListener('click', () => close(s))
  document.body.appendChild(s.backdrop)
  s.el.setAttribute('data-dci-max', '')
  s.el.setAttribute('role', 'dialog')
  s.el.setAttribute('aria-modal', 'true')
  s.el.setAttribute('aria-label', cardTitle(s.el, s.value))
  window.addEventListener('keydown', s.onKey)
  s.overflow = document.documentElement.style.overflow
  document.documentElement.style.overflow = 'hidden'
  paint(s)
  s.btn.focus()
}

// Put the button back when Vue replaced the header it sat in (a v-if swapping Loading for content).
function place(s) {
  const slot = slotFor(s.el, s.float)
  if (s.btn.parentElement === slot) return
  slot.setAttribute('data-expand-head', '')
  slot.appendChild(s.btn)
}

export const vExpand = {
  mounted(el, binding) {
    const s = { el, value: binding.value, float: !!binding.modifiers.float, backdrop: null, overflow: '' }
    s.btn = document.createElement('button')
    s.btn.type = 'button'
    s.btn.className = `dci-btn-icon dci-btn-sm dci-expand-btn${s.float ? ' dci-expand-float' : ''}`
    s.btn.addEventListener('click', (e) => { e.stopPropagation(); if (s.backdrop) close(s); else maximize(s) })
    s.onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(s); s.btn.focus() } }
    if (s.float) el.setAttribute('data-expand-float', '')
    el._dciExpand = s
    paint(s)
    place(s)
  },
  updated(el, binding) {
    const s = el._dciExpand
    if (!s) return
    s.value = binding.value
    place(s)
  },
  beforeUnmount(el) {
    const s = el._dciExpand
    if (!s) return
    close(s)
    s.btn.remove()
    delete el._dciExpand
  },
}
