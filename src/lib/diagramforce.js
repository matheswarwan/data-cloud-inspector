// Open in Diagramforce (feedback #1013; diagramforce.com, Mateusz Dabrowski's free diagram
// editor). As in SFMC Toolkit (utils/diagramforce.js): Diagramforce imports a diagram JSON
// sent over postMessage to a tab opened at #import=postmessage, to its published spec
// (appVersion 1.26.4). Here the diagram is a data model or stream lineage drawing: a card
// per object with the fields shown, relationships as field to field lines, mappings and
// stream feeds as object to object lines. Only names go to that page, never data rows.

import { policy } from './policy.js'

export const DIAGRAMFORCE_ORIGIN = 'https://diagramforce.com'

// Off until the user turns it on in Settings (it hands object and field names to a third-party
// site); never available when the administrator policy disableDiagramforce is set.
const SWITCH = 'dci_diagramforce'
export const diagramforceAllowed = (p = policy()) => !p.disableDiagramforce
export function diagramforceOn() {
  if (!diagramforceAllowed()) return false
  try { return localStorage.getItem(SWITCH) === 'on' } catch { return false }
}
export function setDiagramforceOn(on) {
  try { if (on) localStorage.setItem(SWITCH, 'on'); else localStorage.removeItem(SWITCH) } catch { /* private window */ }
}
const APP_VERSION = '1.26.4'
const COLORS = { DMO: '#1D73C9', DLO: '#74797F', STREAM: '#2E844A', CI: '#B652A7' }
const ROW = 22
const W = 300
const heightFor = (n) => 32 + Math.max(n, 1) * ROW + 18

function link(id, source, target, label, dashed) {
  return {
    id, type: 'standard.Link', z: 3001, source, target,
    router: { name: 'sfManhattan' }, connector: { name: 'rounded', args: { radius: 8 } },
    attrs: { line: { stroke: '#74797F', strokeWidth: 2, targetMarker: { type: 'path', d: 'M 0 0 L -12 0', fill: 'none', stroke: '#74797F', 'stroke-width': 2 } } },
    ...(label ? { labels: [{ position: 0.5, attrs: { text: { text: label } } }] } : {}),
    ...(dashed ? { lineStyle: '8 4' } : {}),
  }
}

/** The diagram JSON for a ModelDiagram graph and its node positions. */
export function diagramToDiagramforce(graph, pos, { title = 'Data model', edgeLabel = () => '' } = {}) {
  const cells = []
  const cellId = new Map()
  const fid = new Map() // `${nodeId}|${field}` -> fid
  graph.nodes.forEach((n, i) => {
    const id = `obj-${i}`
    cellId.set(n.id, id)
    const fields = (n.fields || []).map((f, k) => {
      const key = `n${i}f${k}`
      fid.set(`${n.id}|${f.name}`, key)
      return { label: f.name, apiName: f.name, type: f.type || 'Text', keyType: f.pk ? 'pk' : f.fk ? 'fk' : null, length: null, required: !!f.pk, deprecated: false, fid: key }
    })
    const p = pos[n.id] || { x: i * 360, y: 0 }
    cells.push({
      id, type: 'sf.DataObject', position: { x: Math.round(p.x * 1.35) + 80, y: Math.round(p.y * 1.2) + 80 }, size: { width: W, height: heightFor(fields.length) }, z: 2000,
      objectName: n.kind === 'STREAM' ? `${n.label} (data stream)` : n.label === n.name ? n.name : `${n.label} (${n.name})`,
      headerColor: COLORS[n.kind] || COLORS.DMO, fields, showLabels: false, showFieldLengths: false, keyFieldsOnly: false,
    })
  })
  graph.edges.forEach((e, i) => {
    if (!cellId.has(e.from) || !cellId.has(e.to)) return
    const lf = e.kind === 'rel' && fid.get(`${e.from}|${e.fromField}`)
    const rf = e.kind === 'rel' && fid.get(`${e.to}|${e.toField}`)
    const source = { id: cellId.get(e.from), port: lf ? `field-right-${lf}` : 'er-right' }
    const target = { id: cellId.get(e.to), port: rf ? `field-left-${rf}` : 'er-left' }
    cells.push(link(`edge-${i}`, source, target, edgeLabel(e), e.kind !== 'rel'))
  })
  return { version: 1, appVersion: APP_VERSION, timestamp: Date.now(), title, diagramType: 'datamodel', graph: { cells } }
}

/**
 * Opens Diagramforce in a new tab and sends it the diagram once it says it is ready.
 * Call it from a click. Returns false when the pop-up was blocked.
 */
export function openInDiagramforce(diagram) {
  const win = window.open(`${DIAGRAMFORCE_ORIGIN}/#import=postmessage`, '_blank')
  if (!win) return false
  let done = false
  function onMessage(event) {
    if (event.origin !== DIAGRAMFORCE_ORIGIN || done) return
    const d = event.data
    if (!d || d.source !== 'diagramforce' || d.type !== 'ready') return
    done = true
    window.removeEventListener('message', onMessage)
    win.postMessage({ source: 'diagramforce', type: 'import', v: 1, json: JSON.stringify(diagram) }, DIAGRAMFORCE_ORIGIN)
  }
  window.addEventListener('message', onMessage)
  setTimeout(() => window.removeEventListener('message', onMessage), 60000)
  return true
}
