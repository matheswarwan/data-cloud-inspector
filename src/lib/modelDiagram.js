// Data model diagram (feedback #98): the DMOs as boxes with their key fields, the
// relationships between them, optionally the DLOs mapped into them; laid out with dagre and
// exported as Mermaid, Graphviz DOT, draw.io or (from the drawn SVG) SVG and PNG.

export const NODE = { header: 40, row: 18, pad: 6, minWidth: 190, maxWidth: 360, charWidth: 6.6 }

/** Box size for a node: wide enough for its longest line, tall enough for its fields. */
export function nodeSize(node) {
  const longest = Math.max(node.label.length * 1.15, node.name.length, ...node.fields.map((f) => f.name.length + (f.type ? f.type.length + 2 : 0) + 3))
  const width = Math.round(Math.min(NODE.maxWidth, Math.max(NODE.minWidth, longest * NODE.charWidth + 24)))
  const height = NODE.header + (node.fields.length ? node.fields.length * NODE.row + NODE.pad * 2 : 0)
  return { width, height }
}

const relKey = (r) => [`${r.from}.${r.fromField}`, `${r.to}.${r.toField}`].sort().join('|')

/**
 * Nodes and edges for the DMOs in `names` (a Set of API names).
 * `fields`: 'keys' (primary keys and fields used by a drawn relationship), 'all' or 'none'.
 * `sources`: also draw the DLOs mapped into these DMOs (from `mappings`).
 */
export function diagramGraph(objects, mappings, names, { fields = 'keys', sources = false } = {}) {
  const byName = new Map(objects.map((o) => [o.name, o]))
  const shown = [...names].filter((n) => byName.has(n))
  const inSet = new Set(shown)
  const edges = []
  const seen = new Set()
  const outside = new Map() // DMO name -> relationships to objects not drawn
  for (const n of shown) {
    for (const r of byName.get(n).relationships || []) {
      if (!inSet.has(r.from) || !inSet.has(r.to)) {
        outside.set(n, (outside.get(n) || 0) + 1)
        continue
      }
      if (r.from === r.to && r.fromField === r.toField) continue
      const k = relKey(r)
      if (seen.has(k)) continue
      seen.add(k)
      edges.push({ id: `r${edges.length}`, kind: 'rel', from: r.from, to: r.to, fromField: r.fromField, toField: r.toField, cardinality: r.cardinality })
    }
  }
  const used = new Map() // object -> field names used by a drawn edge
  const use = (obj, f) => { if (f) (used.get(obj) || used.set(obj, new Set()).get(obj)).add(f) }
  for (const e of edges) { use(e.from, e.fromField); use(e.to, e.toField) }

  const pick = (o) => {
    if (fields === 'none') return []
    const keep = fields === 'all' ? o.fields : o.fields.filter((f) => f.primaryKey || used.get(o.name)?.has(f.name))
    return keep.map((f) => ({ name: f.name, label: f.label, type: f.businessType || f.type || '', pk: !!f.primaryKey, fk: !!used.get(o.name)?.has(f.name) && !f.primaryKey }))
  }
  const nodes = shown.map((n) => {
    const o = byName.get(n)
    return { id: n, kind: 'DMO', name: n, label: o.label, category: o.category || '', fields: pick(o), fieldCount: o.fields.length, outside: outside.get(n) || 0 }
  })

  if (sources) {
    const dlos = new Map()
    for (const m of mappings || []) {
      if (!inSet.has(m.target)) continue
      if (!dlos.has(m.source)) {
        const o = byName.get(m.source)
        dlos.set(m.source, { id: m.source, kind: 'DLO', name: m.source, label: o?.label || m.source, category: o?.category || '', fields: [], fieldCount: o?.fields.length || 0, outside: 0 })
      }
      edges.push({ id: `m${edges.length}`, kind: 'map', from: m.source, to: m.target, fromField: '', toField: '', cardinality: '', count: m.fields?.length || 0 })
    }
    nodes.push(...dlos.values())
  }
  for (const n of nodes) Object.assign(n, nodeSize(n))
  return { nodes, edges }
}

/** Positions from dagre (passed in, so this file stays free of the library): { [id]: { x, y } } top-left. */
// Only the box positions are used (edges are drawn as curves between the boxes), so dagre
// gets one edge per pair of boxes: parallel edges can make it fail ("Not possible to find
// intersection inside of the rectangle"). If it still fails, the boxes go in a grid.
export function layoutDiagram(graph, dagre, { rankdir = 'LR' } = {}) {
  try {
    const g = new dagre.graphlib.Graph()
    g.setGraph({ rankdir, nodesep: 28, ranksep: 90, edgesep: 12, marginx: 20, marginy: 20 })
    g.setDefaultEdgeLabel(() => ({}))
    for (const n of graph.nodes) g.setNode(n.id, { width: n.width, height: n.height })
    const pairs = new Set()
    for (const e of graph.edges) {
      if (e.from === e.to) continue
      const k = [e.from, e.to].sort().join('|')
      if (pairs.has(k)) continue
      pairs.add(k)
      // Mapping edges point DLO to DMO; relationships go from the "many" side to the "one" side.
      g.setEdge(e.from, e.to)
    }
    dagre.layout(g)
    const pos = {}
    for (const n of graph.nodes) {
      const p = g.node(n.id)
      if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y)) throw new Error(`no position for ${n.id}`)
      pos[n.id] = { x: Math.round(p.x - n.width / 2), y: Math.round(p.y - n.height / 2) }
    }
    return pos
  } catch {
    return gridLayout(graph)
  }
}

/** Boxes in rows, sorted by name: the fallback layout. */
export function gridLayout(graph, { columns = Math.max(1, Math.ceil(Math.sqrt(graph.nodes.length))), gap = 40 } = {}) {
  const pos = {}
  const nodes = [...graph.nodes].sort((a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label))
  let y = 20
  for (let i = 0; i < nodes.length; i += columns) {
    const row = nodes.slice(i, i + columns)
    let x = 20
    for (const n of row) { pos[n.id] = { x, y }; x += n.width + gap }
    y += Math.max(...row.map((n) => n.height)) + gap
  }
  return pos
}

/** The y offset (from the box top) where an edge meets a node: its field row, else the middle. */
export function anchorY(node, field) {
  const i = field ? node.fields.findIndex((f) => f.name === field) : -1
  return i < 0 ? node.height / 2 : NODE.header + NODE.pad + i * NODE.row + NODE.row / 2
}

/** SVG path between two boxes, leaving and entering at the sides that face each other. */
export function edgePath(a, pa, b, pb, e) {
  if (a === b) {
    // A relationship of an object with itself: a loop on the right side.
    const x = pa.x + a.width, y1 = pa.y + anchorY(a, e.fromField), y2 = pa.y + anchorY(a, e.toField)
    const y2b = y2 === y1 ? y1 + 14 : y2
    return { d: `M${x},${y1} C${x + 40},${y1} ${x + 40},${y2b} ${x},${y2b}`, mid: { x: x + 30, y: (y1 + y2b) / 2 } }
  }
  const ay = pa.y + anchorY(a, e.fromField)
  const by = pb.y + anchorY(b, e.toField)
  const aRight = pa.x + a.width <= pb.x + b.width / 2
  const x1 = aRight ? pa.x + a.width : pa.x
  const bLeft = pb.x >= pa.x + a.width / 2
  const x2 = bLeft ? pb.x : pb.x + b.width
  const c = Math.max(40, Math.abs(x2 - x1) / 2)
  const c1 = aRight ? x1 + c : x1 - c
  const c2 = bLeft ? x2 - c : x2 + c
  return { d: `M${x1},${ay} C${c1},${ay} ${c2},${by} ${x2},${by}`, mid: { x: (x1 + x2) / 2, y: (ay + by) / 2 } }
}

/** Short cardinality text: 1:1, 1:N, N:1, N:N. */
// Data Cloud's metadata says NTOONE and ONETOONE; the long forms are accepted too.
const CARD = { ONETOONE: '1:1', ONETON: '1:N', ONETOMANY: '1:N', NTOONE: 'N:1', MANYTOONE: 'N:1', NTON: 'N:N', MANYTOMANY: 'N:N' }
export function cardinalityText(c) {
  return CARD[String(c || '').toUpperCase()] || ''
}

const MERMAID_REL = { '1:1': '||--||', '1:N': '||--o{', 'N:1': '}o--||', 'N:N': '}o--o{' }
const mermaidId = (s) => s.replace(/[^A-Za-z0-9_]/g, '_')
const mermaidType = (t) => (t || 'field').replace(/[^A-Za-z0-9_]/g, '_')
const quote = (s) => `"${String(s).replace(/"/g, "'")}"`

/** Mermaid erDiagram text (renders on GitHub, in Notion and in many Markdown tools). */
export function toMermaid(graph) {
  const lines = ['erDiagram']
  for (const n of graph.nodes) {
    const id = mermaidId(n.name)
    if (!n.fields.length) { lines.push(`  ${id} {`, `  }`); continue }
    lines.push(`  ${id} {`)
    for (const f of n.fields) lines.push(`    ${mermaidType(f.type)} ${mermaidId(f.name)}${f.pk ? ' PK' : f.fk ? ' FK' : ''}`)
    lines.push('  }')
  }
  for (const e of graph.edges) {
    if (e.kind === 'map') lines.push(`  ${mermaidId(e.from)} }o..|| ${mermaidId(e.to)} : ${quote('maps to')}`)
    else lines.push(`  ${mermaidId(e.from)} ${MERMAID_REL[cardinalityText(e.cardinality)] || '}o--o{'} ${mermaidId(e.to)} : ${quote(e.fromField && e.toField ? `${e.fromField} = ${e.toField}` : 'related')}`)
  }
  return `${lines.join('\n')}\n`
}

/** A Markdown document: title, the Mermaid diagram, and the relationships as a table. */
export function toDiagramMarkdown(graph, { title = 'Data model diagram', subtitle = '' } = {}) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const cell = (s) => String(s ?? '').replace(/\|/g, '\\|')
  const rels = graph.edges.filter((e) => e.kind === 'rel')
  const out = [`# ${title}`, '']
  if (subtitle) out.push(subtitle, '')
  out.push('```mermaid', toMermaid(graph).trimEnd(), '```', '', '## Relationships', '')
  if (!rels.length) out.push('No relationships between the objects shown.', '')
  else {
    out.push('| From | Field | To | Field | Cardinality |', '| --- | --- | --- | --- | --- |')
    for (const e of rels) out.push(`| ${cell(byId.get(e.from)?.label)} (\`${e.from}\`) | \`${e.fromField}\` | ${cell(byId.get(e.to)?.label)} (\`${e.to}\`) | \`${e.toField}\` | ${cardinalityText(e.cardinality) || cell(e.cardinality)} |`)
    out.push('')
  }
  return out.join('\n')
}

/** Graphviz DOT (render with `dot -Tsvg`). */
export function toDot(graph) {
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const lines = ['digraph DataModel {', '  rankdir=LR;', '  node [shape=box, style="rounded", fontname="Helvetica", fontsize=10];', '  edge [fontname="Helvetica", fontsize=9];']
  for (const n of graph.nodes) {
    const body = [n.label, n.name, ...n.fields.map((f) => `${f.pk ? 'PK ' : f.fk ? 'FK ' : ''}${f.name}`)].map(esc).join('\\l')
    lines.push(`  "${esc(n.id)}" [label="${body}\\l"${n.kind === 'DLO' ? ', style="rounded,dashed"' : ''}];`)
  }
  for (const e of graph.edges) {
    const label = e.kind === 'map' ? 'maps to' : [cardinalityText(e.cardinality), e.fromField && `${e.fromField} = ${e.toField}`].filter(Boolean).join(' ')
    lines.push(`  "${esc(e.from)}" -> "${esc(e.to)}" [label="${esc(label)}"${e.kind === 'map' ? ', style=dashed' : ''}];`)
  }
  lines.push('}')
  return `${lines.join('\n')}\n`
}

const xml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** draw.io (diagrams.net) file with the boxes where they are on screen. */
export function toDrawio(graph, pos) {
  const cells = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>']
  const id = new Map(graph.nodes.map((n, i) => [n.id, `n${i}`]))
  for (const n of graph.nodes) {
    const p = pos[n.id] || { x: 0, y: 0 }
    const html = `<b>${xml(n.label)}</b><br><font style="font-size:9px">${xml(n.name)}</font>${n.fields.length ? `<hr>${n.fields.map((f) => `${f.pk ? 'PK ' : f.fk ? 'FK ' : ''}${xml(f.name)}`).join('<br>')}` : ''}`
    const style = `rounded=1;whiteSpace=wrap;html=1;align=left;verticalAlign=top;spacingLeft=6;spacingTop=2;arcSize=4;${n.kind === 'DLO' ? 'dashed=1;fillColor=#f5f5f5;' : 'fillColor=#ffffff;'}strokeColor=#64748b;fontSize=11;`
    cells.push(`<mxCell id="${id.get(n.id)}" value="${xml(html)}" style="${style}" vertex="1" parent="1"><mxGeometry x="${p.x}" y="${p.y}" width="${n.width}" height="${n.height}" as="geometry"/></mxCell>`)
  }
  graph.edges.forEach((e, i) => {
    const label = e.kind === 'map' ? 'maps to' : cardinalityText(e.cardinality)
    const style = `edgeStyle=entityRelationEdgeStyle;html=1;endArrow=none;strokeColor=#64748b;fontSize=9;${e.kind === 'map' ? 'dashed=1;endArrow=block;' : ''}`
    cells.push(`<mxCell id="e${i}" value="${xml(label)}" style="${style}" edge="1" parent="1" source="${id.get(e.from)}" target="${id.get(e.to)}"><mxGeometry relative="1" as="geometry"/></mxCell>`)
  })
  return `<mxfile host="Data Cloud Inspector"><diagram name="Data model"><mxGraphModel><root>${cells.join('')}</root></mxGraphModel></diagram></mxfile>\n`
}

/** Bounding box of the drawn nodes. */
export function diagramBounds(graph, pos, margin = 20) {
  if (!graph.nodes.length) return { x: 0, y: 0, width: 100, height: 100 }
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
  for (const n of graph.nodes) {
    const p = pos[n.id]
    if (!p) continue
    x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y)
    x2 = Math.max(x2, p.x + n.width + (graph.edges.some((e) => e.from === n.id && e.to === n.id) ? 50 : 0)); y2 = Math.max(y2, p.y + n.height)
  }
  return { x: x1 - margin, y: y1 - margin, width: x2 - x1 + margin * 2, height: y2 - y1 + margin * 2 }
}

/** Ids of a node and everything one edge away from it. */
export function neighbours(graph, id) {
  const out = new Set([id])
  for (const e of graph.edges) {
    if (e.from === id) out.add(e.to)
    if (e.to === id) out.add(e.from)
  }
  return out
}
