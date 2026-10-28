// @vitest-environment node
import { readFileSync } from 'node:fs'
import { renderPrivacy } from '../../../scripts/build-privacy.mjs'

const root = new URL('../../../', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8')

describe('privacy policy', () => {
  it('both privacy.html files are rendered from PRIVACY.md (run node scripts/build-privacy.mjs)', () => {
    const html = renderPrivacy(read('PRIVACY.md'))
    expect(read('public/privacy.html')).toBe(html)
    expect(read('site/public/privacy.html')).toBe(html)
  })
  it('names the publisher and escapes HTML', () => {
    expect(renderPrivacy(read('PRIVACY.md'))).toContain('published by <strong>Ateko</strong>')
    expect(renderPrivacy('# T\n\n- a <b> `x`')).toContain('<li>a &lt;b&gt; <code>x</code></li>')
  })
})
