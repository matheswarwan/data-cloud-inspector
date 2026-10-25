// Downloads for any page (feedback #146, #149): a page describes what it shows as sections and
// this turns them into an export document (Markdown, Word, PDF, HTML) and Excel sheets.
// Section kinds: { heading?, kv: [[label, value]] }, { heading?, columns, rows } (DataTable-style
// columns: { key, label, value? }), { heading?, text }, { heading?, list: [text] },
// { heading?, code }.

const text = (v) => (v == null ? '' : Array.isArray(v) ? v.join(', ') : String(v))

/** Table cells from DataTable-style columns ({ key, label, value? }) and rows. */
export function tableFromColumns(columns, rows) {
  return {
    columns: columns.map((c) => c.label),
    rows: rows.map((r) => columns.map((c) => text(c.value ? c.value(r) : r[c.key]))),
  }
}

export function docFrom({ title, intro = '', sections = [] }) {
  const blocks = []
  if (intro) blocks.push({ type: 'p', text: intro })
  for (const s of sections) {
    if (s.heading) blocks.push({ type: 'h', level: 2, text: s.heading })
    if (s.kv) blocks.push({ type: 'kv', rows: s.kv.map(([k, v]) => [k, text(v)]) })
    if (s.columns) {
      const t = tableFromColumns(s.columns, s.rows || [])
      blocks.push(t.rows.length ? { type: 'table', columns: t.columns, rows: t.rows } : { type: 'p', text: s.empty || 'None.' })
    }
    if (s.text) blocks.push({ type: 'p', text: s.text })
    if (s.list) blocks.push(s.list.length ? { type: 'list', items: s.list.map(text) } : { type: 'p', text: s.empty || 'None.' })
    if (s.code) blocks.push({ type: 'code', text: s.code, lang: s.lang || '' })
  }
  return { title, blocks }
}

/** Excel sheets: one per table or details section, named after its heading. */
export function sheetsFrom(sections = [], fallback = 'Sheet') {
  const sheets = []
  for (const s of sections) {
    const name = (s.heading || fallback).slice(0, 31)
    if (s.columns) { const t = tableFromColumns(s.columns, s.rows || []); sheets.push({ name, columns: t.columns, rows: t.rows }) }
    else if (s.kv) sheets.push({ name, columns: ['Detail', 'Value'], rows: s.kv.map(([k, v]) => [k, text(v)]) })
  }
  return sheets
}
