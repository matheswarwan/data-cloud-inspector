// Data models page: the DMOs, either only those something is mapped into or all of them,
// with where their data comes from and what uses them; exported as a document or Excel.

import { usageOf, fieldUsage } from './usage.js'
import { buildModel, modelMarkdown } from './modelDoc.js'

/** `[{ obj, sources: [{ dlo, stream, fields }], usedBy }]` for the DMOs, mapped ones only unless `all`. */
export function dataModelRows(objects, mappings, streams, usage, { all = false } = {}) {
  const streamByDlo = new Map((streams || []).map((s) => [s.dlo, s]))
  return objects
    .filter((o) => o.kind === 'DMO')
    .map((o) => {
      const maps = (mappings || []).filter((m) => m.target === o.name)
      const u = usageOf(o.name, usage)
      return {
        obj: o,
        sources: maps.map((m) => ({ dlo: m.source, stream: streamByDlo.get(m.source)?.label || '', fields: m.fields })),
        usedBy: u ? u.insights.length + u.segments.length : 0,
      }
    })
    .filter((r) => all || r.sources.length)
    .sort((a, b) => a.obj.label.localeCompare(b.obj.label))
}

export function dataModelMarkdown(rows, objects, mappings, streams, usage, { host = '', dataSpace = '' } = {}) {
  const names = new Set(rows.map((r) => r.obj.name))
  return modelMarkdown(buildModel({ objects: objects.filter((o) => names.has(o.name)), kinds: ['DMO'], mappings, streams, usage, host, dataSpace }))
}

/** Excel: one sheet of DMOs, one of fields, one of field mappings. */
export function dataModelSheets(rows, usage) {
  return [
    {
      name: 'Data models',
      columns: ['DMO', 'API name', 'Category', 'Fields', 'Mapped from', 'Streams', 'Used by'],
      rows: rows.map((r) => [r.obj.label, r.obj.name, r.obj.category, r.obj.fields.length, r.sources.map((s) => s.dlo).join(', '), r.sources.map((s) => s.stream).filter(Boolean).join(', '), r.usedBy]),
    },
    {
      name: 'Fields',
      columns: ['DMO', 'Field', 'Label', 'Type', 'Primary key', 'Key qualifier', 'Mapped from', 'Used by'],
      rows: rows.flatMap((r) => {
        const uses = fieldUsage(r.obj.name, usage)
        return r.obj.fields.map((f) => [
          r.obj.name, f.name, f.label, f.businessType || f.type, f.primaryKey ? 'yes' : '', f.keyQualifier,
          r.sources.flatMap((s) => s.fields.filter((m) => m.target === f.name).map((m) => `${s.dlo}.${m.source}`)).join(', '),
          (uses.get(f.name) || []).join(', '),
        ])
      }),
    },
    {
      name: 'Mappings',
      columns: ['DMO', 'DMO field', 'Source DLO', 'Source field', 'Stream'],
      rows: rows.flatMap((r) => r.sources.flatMap((s) => s.fields.map((m) => [r.obj.name, m.target, s.dlo, m.source, s.stream]))),
    },
  ]
}
