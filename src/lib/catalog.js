// The org's Data Cloud objects from GET /ssot/metadata, one call per entity type:
// data lake objects (__dll), data model objects (__dlm, with relationships) and
// calculated insights (__cio, dimensions and measures instead of fields).

export const KINDS = {
  DataLakeObject: 'DLO',
  DataModelObject: 'DMO',
  CalculatedInsight: 'CI',
}

function normalizeField(f, pkNames, role) {
  return {
    name: f.name,
    label: f.displayName || f.name,
    type: f.type || '',
    businessType: f.businessType || '',
    keyQualifier: f.keyQualifier || '',
    primaryKey: pkNames.has(f.name),
    role: role || '',
  }
}

export function normalizeObject(raw, kind) {
  const pkNames = new Set((raw.primaryKeys || []).map((p) => p.name))
  const fields = kind === 'CI'
    ? [
        ...(raw.dimensions || []).map((f) => normalizeField(f, pkNames, 'dimension')),
        ...(raw.measures || []).map((f) => normalizeField(f, pkNames, 'measure')),
      ]
    : (raw.fields || []).map((f) => normalizeField(f, pkNames))
  return {
    name: raw.name,
    label: raw.displayName || raw.name,
    kind,
    category: raw.category || '',
    fields,
    primaryKeys: (raw.primaryKeys || []).map((p) => p.name),
    relationships: (raw.relationships || []).map((r) => ({
      from: r.fromEntity,
      to: r.toEntity,
      fromField: r.fromEntityAttribute || '',
      toField: r.toEntityAttribute || '',
      cardinality: r.cardinality || '',
    })),
    reference: raw.referenceModelEntityDeveloperName || '',
    partitionBy: raw.partitionBy || '',
    latestProcessTime: raw.latestProcessTime || '',
    latestSuccessfulProcessTime: raw.latestSuccessfulProcessTime || '',
  }
}

/** `{ objects, errors, loadedAt }`. A failed entity type is reported, not fatal. */
export async function loadCatalog(call, version) {
  const entries = Object.entries(KINDS)
  const results = await Promise.all(entries.map(([type]) =>
    call(`/services/data/v${version}/ssot/metadata?entityType=${type}`)))
  const objects = []
  const errors = []
  results.forEach((res, i) => {
    const [type, kind] = entries[i]
    if (!res.ok) { errors.push(`${type}: ${res.error || `HTTP ${res.status}`}`); return }
    for (const raw of res.data?.metadata || []) objects.push(normalizeObject(raw, kind))
  })
  objects.sort((a, b) => a.label.localeCompare(b.label))
  return { objects, errors, loadedAt: new Date().toISOString() }
}

export function filterObjects(objects, { text = '', kinds = [], category = '' } = {}) {
  const t = text.trim().toLowerCase()
  return objects.filter((o) =>
    (!kinds.length || kinds.includes(o.kind)) &&
    (!category || o.category === category) &&
    (!t || o.name.toLowerCase().includes(t) || o.label.toLowerCase().includes(t)))
}

/** `{ table: [field names] }` for SQL autocomplete. */
export function sqlSchema(objects) {
  const schema = {}
  for (const o of objects) schema[o.name] = o.fields.map((f) => f.name)
  return schema
}

export function selectFor(obj, { limit = 100 } = {}) {
  const fields = obj.fields.length ? obj.fields.map((f) => f.name) : ['*']
  return `SELECT\n  ${fields.join(',\n  ')}\nFROM ${obj.name}\nLIMIT ${limit}`
}

/** Fields and relationships as Markdown, for docs or pasting into an AI chat. */
export function objectMarkdown(obj) {
  const lines = [
    `# ${obj.label} (\`${obj.name}\`)`,
    '',
    `${obj.kind}${obj.category ? `, ${obj.category}` : ''}${obj.primaryKeys.length ? `, primary key ${obj.primaryKeys.map((k) => `\`${k}\``).join(', ')}` : ''}`,
    '',
    '| Field | Label | Type |',
    '| --- | --- | --- |',
    ...obj.fields.map((f) => `| \`${f.name}\` | ${f.label} | ${f.businessType || f.type}${f.role ? ` (${f.role})` : ''} |`),
  ]
  if (obj.relationships.length) {
    lines.push('', '## Relationships', '')
    for (const r of obj.relationships) {
      lines.push(`- \`${r.from}.${r.fromField}\` to \`${r.to}.${r.toField}\`${r.cardinality ? ` (${r.cardinality})` : ''}`)
    }
  }
  return lines.join('\n')
}
