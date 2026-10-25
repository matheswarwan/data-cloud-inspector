// Data streams downloads (feedback #146): the list and one stream, as an export document
// (Markdown, Word, PDF, HTML) and Excel sheets. Cells come from the page's table columns, so
// a download has what the table shows, in the order and with the filters applied.

import { tableFromColumns } from './tableDoc.js'

export { tableFromColumns }

export function streamsDoc({ columns, rows, org = '', dataSpace = 'default', at = new Date() }) {
  const t = tableFromColumns(columns, rows)
  return {
    title: `Data streams${org ? `: ${org}` : ''}`,
    blocks: [
      { type: 'p', text: `${at.toISOString().slice(0, 10)}, data space ${dataSpace}. ${rows.length} data streams.` },
      { type: 'table', columns: t.columns, rows: t.rows },
    ],
  }
}

export function streamsSheets({ columns, rows }) {
  const t = tableFromColumns(columns, rows)
  return [{ name: 'Data streams', columns: t.columns, rows: t.rows }]
}

/** One stream: details, what it maps into, and its source fields. */
export function streamDoc({ stream, details = [], mapsTo = [], fields = [], org = '' }) {
  return {
    title: `Data stream: ${stream.label}`,
    blocks: [
      { type: 'p', text: `${stream.name}${org ? ` in ${org}` : ''}.` },
      { type: 'kv', rows: details },
      { type: 'h', level: 2, text: 'Maps into' },
      mapsTo.length
        ? { type: 'list', items: mapsTo.map((m) => `${m.target} (${m.fields.length} fields)`) }
        : { type: 'p', text: 'Its data lake object is not mapped to any data model object.' },
      { type: 'h', level: 2, text: `Source fields (${fields.length})` },
      { type: 'table', columns: ['Source field', 'Type', 'DLO field', 'DLO label'], rows: fields.map((f) => [f.name, f.type, f.dloField, f.dloField && f.dloLabel !== f.dloField ? f.dloLabel : '']) },
    ],
  }
}

export function streamSheets({ stream, details = [], mapsTo = [], fields = [] }) {
  return [
    { name: 'Stream', columns: ['Detail', 'Value'], rows: [['Data stream', stream.label], ['API name', stream.name], ...details] },
    { name: 'Source fields', columns: ['Source field', 'Type', 'DLO field', 'DLO label'], rows: fields.map((f) => [f.name, f.type, f.dloField, f.dloLabel]) },
    { name: 'Maps into', columns: ['Data model object', 'Mapped fields'], rows: mapsTo.map((m) => [m.target, m.fields.length]) },
  ]
}
