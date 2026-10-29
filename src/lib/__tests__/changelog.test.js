import { describe, it, expect } from 'vitest'
import { parseChangelog, inlineHtml } from '../changelog.js'

describe('changelog for Help (feedback #1040)', () => {
  it('splits versions into paragraphs and lists', () => {
    const c = parseChangelog('# Changelog\n\nIntro.\n\n## 1.0.8\n\n**Permissions:** none.\nMore.\n\n- one `a`\n- two\n\n## 1.0.7 (2026-10-27)\n\nText.')
    expect(c.intro).toEqual([{ type: 'p', html: 'Intro.' }])
    expect(c.sections.map((s) => s.title)).toEqual(['1.0.8', '1.0.7 (2026-10-27)'])
    expect(c.sections[0].blocks).toEqual([
      { type: 'p', html: '<strong>Permissions:</strong> none. More.' },
      { type: 'ul', items: ['one <code class="font-mono text-[12px]">a</code>', 'two'] },
    ])
  })
  it('escapes HTML', () => {
    expect(inlineHtml('<img src=x onerror=alert(1)> & "q"')).toBe('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;q&quot;')
  })
})
