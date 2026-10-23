// Data graphs. Checked live 2026-10-23 on a standard data graph: GET /ssot/data-graphs/metadata
// answered an empty list even with a graph in the org, so the list comes from SOQL on the
// DataGraph object and each definition from GET /ssot/data-graphs/<api name>: { name, label,
// primaryObjectName, status, idDmoName, valuesDmoName, sourceObject: { name, label, fields:
// [{ sourceFieldName, isKeyColumn, dataType }], path: [{ fieldName, parentFieldName }],
// relatedObjects: [...same...] } }. One record's graph: GET /ssot/data-graphs/data/<name>/<id>.

const NAME_KEYS = ['developerName', 'name', 'apiName', 'dataGraphName']
const LABEL_KEYS = ['label', 'displayName', 'masterLabel']

export function nameOf(node) {
  for (const k of NAME_KEYS) if (typeof node?.[k] === 'string' && node[k]) return node[k]
  return ''
}

export function labelOf(node) {
  for (const k of LABEL_KEYS) if (typeof node?.[k] === 'string' && node[k]) return node[k]
  return nameOf(node)
}

/** The scalar properties of a node, for a definition list. */
export function scalars(node) {
  return Object.entries(node || {}).filter(([, v]) => v == null || ['string', 'number', 'boolean'].includes(typeof v)).filter(([, v]) => v !== '' && v != null)
}

/**
 * The objects inside a graph as a tree: every nested array of objects that have a name
 * becomes children. `[{ name, label, fields: [names], children }]`.
 */
// Not objects of the graph: fields, segments, joins, filters, and the ID and values tables.
const SKIP_KEYS = /field|segment|dependency|path|criteria|config|dmo/i
const fieldName = (f) => (typeof f === 'string' ? f : f?.sourceFieldName || nameOf(f))

export function objectTree(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return []
  const out = []
  for (const [key, value] of Object.entries(node)) {
    if (SKIP_KEYS.test(key)) continue
    // A list of objects, or one object (for example the graph's root object).
    const list = Array.isArray(value) ? value : value && typeof value === 'object' && nameOf(value) ? [value] : []
    if (!list.length || typeof list[0] !== 'object') continue
    for (const child of list) {
      const name = nameOf(child)
      if (!name) continue
      const fieldList = Object.entries(child).find(([k, v]) => /field/i.test(k) && Array.isArray(v))?.[1] || []
      // The join to the parent object, when the graph gives it (one hop).
      const hops = child.path || child.paths // definition: path; metadata list: paths
      const hop = Array.isArray(hops) && hops.length === 1 ? hops[0] : null
      const join = hop?.fieldName && hop?.parentFieldName ? { childField: hop.fieldName, parentField: hop.parentFieldName } : null
      out.push({ name, label: labelOf(child), via: key, fields: fieldList.map(fieldName).filter(Boolean), join, children: objectTree(child, depth + 1) })
    }
  }
  return out
}

/** The catalog object a graph node names: the exact API name, with __dlm added, or by label. */
export function resolveObject(name, objects) {
  if (!name) return null
  const lower = name.toLowerCase()
  return objects.find((o) => o.name === name) || objects.find((o) => o.name === `${name}__dlm`)
    || objects.find((o) => o.name.toLowerCase() === lower) || objects.find((o) => o.label.toLowerCase() === lower) || null
}

/** The relationship between two catalog objects, as `{ parentField, childField }`, either direction. */
export function joinBetween(parent, child) {
  for (const r of [...(child.relationships || []), ...(parent.relationships || [])]) {
    if (r.from === child.name && r.to === parent.name) return { childField: r.fromField, parentField: r.toField }
    if (r.from === parent.name && r.to === child.name) return { parentField: r.fromField, childField: r.toField }
  }
  return null
}

const MAX_DEFAULT_FIELDS = 8

/**
 * A SELECT that joins a data graph's objects along their relationships in the catalog
 * (LEFT JOIN, so the root's rows stay even without related records). Uses the graph's
 * fields when it lists them, else the primary keys and the first few fields.
 */
export function graphSql(graph, objects, { limit = 100 } = {}) {
  const tree = objectTree(graph)
  const primary = graph?.primaryObjectName || graph?.primaryObject || ''
  const roots = tree.filter((t) => resolveObject(t.name, objects))
  const root = roots.find((t) => t.name === primary || resolveObject(t.name, objects)?.name === resolveObject(primary, objects)?.name) || roots[0]
  if (!root) return { sql: '', notes: ['None of the objects in this data graph are in the metadata catalog.'] }
  const cols = []
  const joins = []
  const notes = []
  let n = 0
  const columnsFor = (obj, node, alias) => {
    const listed = node.fields.filter((f) => obj.fields.some((x) => x.name === f))
    const names = listed.length ? listed : [...new Set([...obj.primaryKeys, ...obj.fields.slice(0, MAX_DEFAULT_FIELDS).map((x) => x.name)])].slice(0, MAX_DEFAULT_FIELDS)
    for (const f of names) cols.push(`${alias}.${f} AS ${alias}_${f}`)
  }
  const walk = (node, obj, alias) => {
    columnsFor(obj, node, alias)
    for (const child of node.children) {
      const cobj = resolveObject(child.name, objects)
      if (!cobj) { notes.push(`${child.name} is not in the metadata catalog, so it is left out.`); continue }
      const j = child.join || joinBetween(obj, cobj)
      if (!j) { notes.push(`No relationship between ${obj.name} and ${cobj.name} in the metadata, so ${cobj.name} is left out.`); continue }
      const ca = `t${++n}`
      joins.push(`LEFT JOIN ${cobj.name} ${ca} ON ${ca}.${j.childField} = ${alias}.${j.parentField}`)
      walk(child, cobj, ca)
    }
  }
  const robj = resolveObject(root.name, objects)
  walk(root, robj, 't0')
  const head = [`-- Data graph ${nameOf(graph) || ''}: its objects joined along their relationships.`, '-- Related records repeat the root row once per match. Add a WHERE on t0 to look at one record.']
  for (const x of notes) head.push(`-- ${x}`)
  const sql = [...head, `SELECT\n  ${cols.join(',\n  ')}`, `FROM ${robj.name} t0`, ...joins, `LIMIT ${limit}`].join('\n')
  return { sql, notes }
}

/** A SELECT on the table the built graph is stored in: one JSON document per record. */
export function valuesSql(graph, { limit = 10 } = {}) {
  if (!graph?.valuesDmoName) return ''
  return `-- Data graph ${nameOf(graph)} as built: one row per ${graph.primaryObjectLabel || 'record'}, the graph as JSON in json_blob__c.\nSELECT Id__c, last_refreshed_on__c, json_blob__c\nFROM ${graph.valuesDmoName}\nLIMIT ${limit}`
}

/** GET path of one record's data graph data (read only). */
export function graphRecordPath(version, graphName, recordId) {
  return `/services/data/v${version}/ssot/data-graphs/data/${encodeURIComponent(graphName)}/${encodeURIComponent(recordId)}`
}

/** Parses JSON held in strings (data graph rows carry the graph as a JSON text), recursively. */
export function expandJson(v, depth = 0) {
  if (depth > 8) return v
  if (typeof v === 'string' && /^\s*[[{]/.test(v)) {
    // The data graph API sends json_blob__c HTML-escaped ({&quot;ssot__Id__c&quot;:...}).
    const text = /&(quot|amp|lt|gt|#39);/.test(v) ? v.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') : v
    try { return expandJson(JSON.parse(text), depth + 1) } catch { return v }
  }
  if (Array.isArray(v)) return v.map((x) => expandJson(x, depth + 1))
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, expandJson(x, depth + 1)]))
  return v
}

const LIST_SOQL = 'SELECT Id, Name, DataGraphApiName, PrimaryDmo, Status, LastRunStatus, RecordCount, DataSpaceId, LastRefreshDate, DataGraphType FROM DataGraph ORDER BY Name'

/**
 * Every data graph with its definition: the DataGraph records (SOQL; they have the label and
 * run status) and each one's definition, 4 at a time; `dataSpaceId` keeps one data space.
 * When SOQL fails, the metadata list (which leaves out graphs that have not finished building).
 */
export async function loadDataGraphs(call, version, { dataSpaceId = call.dataSpaceId } = {}) {
  const base = `/services/data/v${version}`
  const res = await call(`${base}/query?q=${encodeURIComponent(LIST_SOQL)}`)
  if (!res.ok) {
    const meta = await call(`${base}/ssot/data-graphs/metadata`)
    if (!meta.ok) throw new Error(meta.error || res.error || `HTTP ${meta.status}`)
    return meta.data?.dataGraphMetadata || meta.data?.dataGraphs || []
  }
  const rows = (res.data?.records || []).filter((r) => !dataSpaceId || !r.DataSpaceId || r.DataSpaceId.slice(0, 15) === String(dataSpaceId).slice(0, 15))
  const out = new Array(rows.length)
  let next = 0
  const worker = async () => {
    for (let i = next++; i < rows.length; i = next++) {
      const r = rows[i]
      const def = await call(`${base}/ssot/data-graphs/${encodeURIComponent(r.DataGraphApiName)}`)
      out[i] = { ...(def.ok ? def.data : { name: r.DataGraphApiName, label: r.Name, error: def.error || `HTTP ${def.status}` }), record: { id: r.Id, status: r.Status, lastRunStatus: r.LastRunStatus, recordCount: r.RecordCount, lastRefresh: r.LastRefreshDate, type: r.DataGraphType } }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
  return out
}
