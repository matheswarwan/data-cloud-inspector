import { describe, it, expect } from 'vitest'
import { createApp, h, ref, nextTick, withDirectives } from 'vue'
import { vExpand, slotFor, cardTitle } from '../expandCard.js'

function card(html) {
  const el = document.createElement('div')
  el.innerHTML = html
  return el.firstElementChild
}

describe('expandCard', () => {
  it('puts the button in the marked slot, else the first child, else the card', () => {
    const a = card('<section><div class="head"><h3>T</h3><span data-expand-slot></span></div><p>x</p></section>')
    expect(slotFor(a, false).hasAttribute('data-expand-slot')).toBe(true)
    const b = card('<section><h3>T</h3><p>x</p></section>')
    expect(slotFor(b, false).tagName).toBe('H3')
    expect(slotFor(b, true)).toBe(b)
  })

  it('names the dialog from the value or the heading', () => {
    expect(cardTitle(card('<div><h3>  Match   rules (2) </h3></div>'), '')).toBe('Match rules (2)')
    expect(cardTitle(card('<div><h3>x</h3></div>'), 'Chart')).toBe('Chart')
  })

  it('maximizes and restores with the button, the backdrop and Esc', async () => {
    const show = ref(true)
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = createApp({ render: () => (show.value ? withDirectives(h('section', { class: 'dci-card' }, [h('h3', 'Credits per day'), h('p', 'chart')]), [[vExpand]]) : null) })
    app.mount(root)
    const el = root.querySelector('section')
    const btn = el.querySelector('h3 > button.dci-expand-btn')
    expect(btn.getAttribute('aria-label')).toBe('Maximize')
    btn.click()
    expect(el.hasAttribute('data-dci-max')).toBe(true)
    expect(el.getAttribute('role')).toBe('dialog')
    expect(el.getAttribute('aria-label')).toBe('Credits per day')
    expect(document.querySelector('.dci-expand-backdrop')).not.toBeNull()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(el.hasAttribute('data-dci-max')).toBe(false)
    expect(document.querySelector('.dci-expand-backdrop')).toBeNull()
    btn.click()
    document.querySelector('.dci-expand-backdrop').click()
    expect(el.hasAttribute('data-dci-max')).toBe(false)
    btn.click()
    show.value = false
    await nextTick()
    expect(document.querySelector('.dci-expand-backdrop')).toBeNull()
    expect(document.documentElement.style.overflow).toBe('')
    app.unmount()
  })
})
