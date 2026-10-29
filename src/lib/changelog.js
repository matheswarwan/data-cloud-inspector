// CHANGELOG.md as sections for the Help page (feedback #1040): one per `## ` heading, each with
// paragraphs and bullet lists. Inline `**bold**` and `code` become safe HTML (text escaped first).

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Escaped text with **bold** and `code` marked up. */
export function inlineHtml(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, '<code class="font-mono text-[12px]">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
}

/** `{ intro, sections: [{ title, blocks: [{ type: 'p', html } | { type: 'ul', items: [html] }] }] }` */
export function parseChangelog(md) {
  const sections = []
  const intro = []
  let cur = null
  let para = []
  const target = () => (cur ? cur.blocks : intro)
  const flush = () => { if (para.length) { target().push({ type: 'p', html: inlineHtml(para.join(' ')) }); para = [] } }
  for (const raw of String(md || '').split(/\r?\n/)) {
    const line = raw.trimEnd()
    if (/^# /.test(line)) continue
    const h = line.match(/^## (.+)/)
    if (h) { flush(); cur = { title: h[1].trim(), blocks: [] }; sections.push(cur); continue }
    const li = line.match(/^\s*[-*] (.+)/)
    if (li) {
      flush()
      const blocks = target()
      const last = blocks[blocks.length - 1]
      if (last?.type === 'ul') last.items.push(inlineHtml(li[1]))
      else blocks.push({ type: 'ul', items: [inlineHtml(li[1])] })
      continue
    }
    if (!line.trim()) { flush(); continue }
    para.push(line.trim())
  }
  flush()
  return { intro, sections }
}
