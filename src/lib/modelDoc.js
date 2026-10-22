// The data model as one document (Markdown or HTML): every chosen object with fields,
// keys, relationships, what is mapped into it (field by field, with the stream) and what
// uses it. For handovers and audits.

import { usageOf, fieldUsage } from './usage.js'

const KIND_TITLE = { DMO: 'Data model objects', DLO: 'Data lake objects', CI: 'Calculated insights' }

/** A structured model: `{ title, meta, sections: [{ title, objects: [...] }] }`. */
export function buildModel({ objects, kinds = ['DMO'], mappings = [], streams = [], usage = null, host = '', dataSpace = '', at = new Date() }) {
  const streamByDlo = new Map((streams || []).map((s) => [s.dlo, s]))
  const sections = kinds.map((kind) => ({
    title: KIND_TITLE[kind] || kind,
    objects: objects.filter((o) => o.kind === kind).sort((a, b) => a.label.localeCompare(b.label)).map((o) => {
      const uses = fieldUsage(o.name, usage)
      const u = usageOf(o.name, usage)
      return {
        name: o.name,
        label: o.label,
        kind: o.kind,
        category: o.category,
        primaryKeys: o.primaryKeys,
        fields: o.fields.map((f) => ({ ...f, usedBy: uses.get(f.name) || [] })),
        relationships: o.relationships,
        mappedFrom: (mappings || []).filter((m) => m.target === o.name).map((m) => ({ ...m, stream: streamByDlo.get(m.source) || null })),
        mapsTo: (mappings || []).filter((m) => m.source === o.name).map((m) => m.target),
        stream: streamByDlo.get(o.name) || null,
        usedBy: u ? [...u.insights.map((i) => `${i.label} (calculated insight)`), ...u.segments.map((s) => `${s.label} (segment)`)] : [],
      }
    }),
  }))
  return {
    title: `Data Cloud data model${host ? `: ${host}` : ''}`,
    meta: `${at.toISOString().slice(0, 10)}${dataSpace ? `, data space ${dataSpace}` : ''}. ${sections.map((s) => `${s.objects.length} ${s.title.toLowerCase()}`).join(', ')}.`,
    sections,
  }
}

const mdEsc = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')

export function modelMarkdown(model) {
  const out = [`# ${model.title}`, '', model.meta, '']
  for (const s of model.sections) {
    out.push(`## ${s.title}`, '')
    for (const o of s.objects) {
      out.push(`### ${o.label} (\`${o.name}\`)`, '')
      out.push([o.kind, o.category, o.primaryKeys.length ? `primary key ${o.primaryKeys.map((k) => `\`${k}\``).join(', ')}` : '', o.stream ? `from stream ${o.stream.label}` : ''].filter(Boolean).join(', ') + '.', '')
      out.push('| Field | Label | Type | Used by |', '| --- | --- | --- | --- |')
      for (const f of o.fields) out.push(`| \`${f.name}\`${f.primaryKey ? ' (key)' : ''} | ${mdEsc(f.label)} | ${f.businessType || f.type}${f.role ? ` (${f.role})` : ''} | ${mdEsc(f.usedBy.join(', '))} |`)
      out.push('')
      if (o.relationships.length) {
        out.push('Relationships:', '')
        for (const r of o.relationships) out.push(`- \`${r.from}.${r.fromField}\` to \`${r.to}.${r.toField}\`${r.cardinality ? ` (${r.cardinality})` : ''}`)
        out.push('')
      }
      for (const m of o.mappedFrom) {
        out.push(`Mapped from \`${m.source}\`${m.stream ? ` (stream ${m.stream.label})` : ''}:`, '', '| Source field | Field |', '| --- | --- |')
        for (const f of m.fields) out.push(`| \`${f.source}\` | \`${f.target}\` |`)
        out.push('')
      }
      if (o.mapsTo.length) out.push(`Maps to: ${o.mapsTo.map((t) => `\`${t}\``).join(', ')}.`, '')
      if (o.usedBy.length) out.push(`Used by: ${o.usedBy.join('; ')}.`, '')
    }
  }
  return out.join('\n')
}

const h = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function modelHtml(model) {
  const parts = []
  for (const s of model.sections) {
    parts.push(`<h2>${h(s.title)}</h2>`)
    for (const o of s.objects) {
      parts.push(`<section><h3>${h(o.label)} <code>${h(o.name)}</code></h3>`)
      parts.push(`<p class="meta">${h([o.kind, o.category, o.primaryKeys.length ? `primary key ${o.primaryKeys.join(', ')}` : '', o.stream ? `from stream ${o.stream.label}` : ''].filter(Boolean).join(', '))}</p>`)
      parts.push('<table><thead><tr><th>Field</th><th>Label</th><th>Type</th><th>Used by</th></tr></thead><tbody>')
      for (const f of o.fields) parts.push(`<tr><td><code>${h(f.name)}</code>${f.primaryKey ? ' (key)' : ''}</td><td>${h(f.label)}</td><td>${h(f.businessType || f.type)}${f.role ? ` (${h(f.role)})` : ''}</td><td>${h(f.usedBy.join(', '))}</td></tr>`)
      parts.push('</tbody></table>')
      if (o.relationships.length) parts.push(`<p>Relationships:</p><ul>${o.relationships.map((r) => `<li><code>${h(r.from)}.${h(r.fromField)}</code> to <code>${h(r.to)}.${h(r.toField)}</code>${r.cardinality ? ` (${h(r.cardinality)})` : ''}</li>`).join('')}</ul>`)
      for (const m of o.mappedFrom) {
        parts.push(`<p>Mapped from <code>${h(m.source)}</code>${m.stream ? ` (stream ${h(m.stream.label)})` : ''}:</p><table><thead><tr><th>Source field</th><th>Field</th></tr></thead><tbody>${m.fields.map((f) => `<tr><td><code>${h(f.source)}</code></td><td><code>${h(f.target)}</code></td></tr>`).join('')}</tbody></table>`)
      }
      if (o.mapsTo.length) parts.push(`<p>Maps to: ${o.mapsTo.map((t) => `<code>${h(t)}</code>`).join(', ')}.</p>`)
      if (o.usedBy.length) parts.push(`<p>Used by: ${h(o.usedBy.join('; '))}.</p>`)
      parts.push('</section>')
    }
  }
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${h(model.title)}</title><style>
body{font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#1a1f2b;max-width:60rem;margin:2rem auto;padding:0 1rem}
h1{font-size:1.5rem}h2{font-size:1.25rem;margin-top:2.5rem;border-bottom:1px solid #ccc}h3{font-size:1.05rem;margin:1.75rem 0 .25rem}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.9em}.meta{color:#5b6475;margin:0 0 .5rem}
table{border-collapse:collapse;width:100%;margin:.5rem 0}th,td{border:1px solid #d8dce3;padding:.25rem .5rem;text-align:left;vertical-align:top}th{background:#f3f4f7}
section{page-break-inside:avoid}
</style></head><body><h1>${h(model.title)}</h1><p class="meta">${h(model.meta)}</p>${parts.join('\n')}</body></html>`
}
