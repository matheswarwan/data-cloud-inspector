// Field names without a `table.` prefix for the SQL editor (feedback #1026). CodeMirror's SQL
// completion only offers fields after `table.` or `alias.`; this offers the fields of every
// object named in the statement's FROM and JOIN clauses wherever a bare name is typed.

const FROM_JOIN = /\b(?:from|join)\s+("?)([A-Za-z_][\w]*)\1/gi

/** The statement around `pos` (text between semicolons). */
export function statementAt(doc, pos) {
  const start = doc.lastIndexOf(';', pos - 1) + 1
  const end = doc.indexOf(';', pos)
  return doc.slice(start, end < 0 ? doc.length : end)
}

/** Objects in `schema` named after FROM or JOIN in `text`, in order, without repeats. */
export function tablesIn(text, schema) {
  const out = []
  for (const m of String(text).matchAll(FROM_JOIN)) {
    const name = Object.keys(schema).find((t) => t.toLowerCase() === m[2].toLowerCase())
    if (name && !out.includes(name)) out.push(name)
  }
  return out
}

/** `[{ label, detail }]` for the fields of the statement's objects (one entry per field name). */
export function fieldOptions(text, schema) {
  const seen = new Map()
  for (const t of tablesIn(text, schema)) {
    for (const f of schema[t] || []) if (!seen.has(f)) seen.set(f, { label: f, type: 'property', detail: t, boost: 1 })
  }
  return [...seen.values()]
}

/** A CodeMirror completion source over `getSchema()`. */
export function bareFieldSource(getSchema) {
  return (context) => {
    const word = context.matchBefore(/[\w]+/)
    if (!word && !context.explicit) return null
    const from = word ? word.from : context.pos
    const doc = context.state.doc.toString()
    if (from > 0 && /[."]/.test(doc[from - 1])) return null // qualified or quoted: CodeMirror's own completion
    const options = fieldOptions(statementAt(doc, context.pos), getSchema())
    return options.length ? { from, options, validFor: /^\w*$/ } : null
  }
}
