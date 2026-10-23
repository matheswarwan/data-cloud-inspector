<script setup>
// Interactive data model diagram (feedback #98): drag the background to pan, the wheel or
// the buttons to zoom, drag a box to move it, click a box to see its relationships.
// Exports SVG and PNG (the drawing as shown), Mermaid, Markdown, Graphviz and draw.io.
import { ref, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { RouterLink } from 'vue-router'
import { ZoomIn, ZoomOut, Maximize, RotateCcw, Download, Key, Link2 } from 'lucide-vue-next'
import { diagramGraph, layoutDiagram, edgePath, anchorY, cardinalityText, diagramBounds, neighbours, toMermaid, toDot, toDrawio, toDiagramMarkdown, NODE } from '../lib/modelDiagram.js'
import { saveBlob, safeFileName } from '../lib/exportDoc.js'

const props = defineProps({
  objects: { type: Array, default: () => [] },
  mappings: { type: Array, default: () => [] },
  names: { type: Array, default: () => [] }, // DMO API names to draw
  title: { type: String, default: 'Data model diagram' },
  subtitle: { type: String, default: '' },
  fileName: { type: String, default: 'data-model-diagram' },
  // Data streams to draw, each feeding its DLO (Data streams diagram, feedback #104). With
  // streams the DLOs are always drawn.
  streams: { type: Array, default: null },
})

// Stream lineage starts without fields: it is about where data flows, not the keys.
const fields = ref(props.streams ? 'none' : 'keys')
const sources = ref(false)
const graph = computed(() => diagramGraph(props.objects, props.mappings, new Set(props.names), { fields: fields.value, sources: sources.value || !!props.streams, streams: props.streams }))
const byId = computed(() => new Map(graph.value.nodes.map((n) => [n.id, n])))

const pos = reactive({})
const view = reactive({ x: 0, y: 0, k: 1 })
const box = ref(null)
const svg = ref(null)
const layoutError = ref('')
const laying = ref(false)

let dagre = null
async function relayout() {
  laying.value = true
  layoutError.value = ''
  try {
    dagre ||= await import('@dagrejs/dagre')
    const p = layoutDiagram(graph.value, dagre)
    for (const k of Object.keys(pos)) delete pos[k]
    Object.assign(pos, p)
    fit()
  } catch (err) {
    layoutError.value = `Could not lay out the diagram: ${err.message}`
  } finally {
    laying.value = false
  }
}
// A new set of objects or options lays the diagram out again; moved boxes are not kept.
watch(() => [props.names.join(','), fields.value, sources.value, props.objects.length, props.mappings.length, props.streams?.length], relayout)
onMounted(relayout)

const placed = computed(() => graph.value.nodes.filter((n) => pos[n.id]))
const paths = computed(() => graph.value.edges.flatMap((e) => {
  const a = byId.value.get(e.from), b = byId.value.get(e.to)
  if (!a || !b || !pos[a.id] || !pos[b.id]) return []
  return [{ e, ...edgePath(a, pos[a.id], b, pos[b.id], e) }]
}))

// Selection and search
const selected = ref(null)
const hover = ref(null)
const search = ref('')
const focusIds = computed(() => {
  const id = selected.value || hover.value
  return id && byId.value.has(id) ? neighbours(graph.value, id) : null
})
const dim = (id) => focusIds.value && !focusIds.value.has(id)
const edgeDim = (e) => {
  const id = selected.value || hover.value
  return id && byId.value.has(id) && e.from !== id && e.to !== id
}
const matches = computed(() => {
  const t = search.value.trim().toLowerCase()
  return t ? graph.value.nodes.filter((n) => n.label.toLowerCase().includes(t) || n.name.toLowerCase().includes(t)) : []
})
function focusNode(id) {
  const n = byId.value.get(id), p = pos[id]
  if (!n || !p || !box.value) return
  selected.value = id
  const r = box.value.getBoundingClientRect()
  view.k = Math.max(view.k, 0.8)
  view.x = r.width / 2 - (p.x + n.width / 2) * view.k
  view.y = r.height / 2 - (p.y + n.height / 2) * view.k
}
function onSearchEnter() { if (matches.value[0]) focusNode(matches.value[0].id) }
const selNode = computed(() => (selected.value ? byId.value.get(selected.value) : null))
const selEdges = computed(() => (selected.value ? graph.value.edges.filter((e) => e.from === selected.value || e.to === selected.value) : []))
const other = (e) => byId.value.get(e.from === selected.value ? e.to : e.from)

// Pan, zoom, drag
function fit() {
  if (!box.value) return
  const b = diagramBounds(graph.value, pos)
  const r = box.value.getBoundingClientRect()
  const k = Math.min(1.2, Math.max(0.15, Math.min(r.width / b.width, r.height / b.height)))
  view.k = k
  view.x = (r.width - b.width * k) / 2 - b.x * k
  view.y = (r.height - b.height * k) / 2 - b.y * k
}
function zoomAt(factor, cx, cy) {
  const k = Math.min(3, Math.max(0.1, view.k * factor))
  view.x = cx - ((cx - view.x) * k) / view.k
  view.y = cy - ((cy - view.y) * k) / view.k
  view.k = k
}
function zoomButton(factor) {
  const r = box.value.getBoundingClientRect()
  zoomAt(factor, r.width / 2, r.height / 2)
}
function onWheel(e) {
  e.preventDefault()
  const r = box.value.getBoundingClientRect()
  zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top)
}
let drag = null
function onPointerDown(e, id = null) {
  if (e.button !== 0) return
  e.preventDefault()
  drag = { id, x: e.clientX, y: e.clientY, moved: false, from: id ? { ...pos[id] } : { x: view.x, y: view.y } }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
}
function onPointerMove(e) {
  if (!drag) return
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y
  if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true
  if (drag.id) pos[drag.id] = { x: Math.round(drag.from.x + dx / view.k), y: Math.round(drag.from.y + dy / view.k) }
  else { view.x = drag.from.x + dx; view.y = drag.from.y + dy }
}
function onPointerUp() {
  if (drag && !drag.moved) selected.value = drag.id && selected.value !== drag.id ? drag.id : null
  drag = null
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
}
function onKey(e) {
  if (e.target.closest?.('input, select, textarea')) return
  if (e.key === 'Escape') selected.value = null
  else if (e.key === '+' || e.key === '=') zoomButton(1.2)
  else if (e.key === '-') zoomButton(1 / 1.2)
  else if (e.key === '0') fit()
}
onBeforeUnmount(onPointerUp)

// Colours per category (the same in light and dark), and the theme's tokens for the rest.
const CATEGORY = { Profile: '#2563eb', Engagement: '#d97706', Related: '#059669', Other: '#7c3aed' }
const STREAM_COLOUR = '#0891b2'
const stripe = (n) => (n.kind === 'STREAM' ? STREAM_COLOUR : n.kind === 'DLO' ? '#94a3b8' : CATEGORY[n.category.replace(/_/g, ' ')] || '#64748b')
const T = (name, alpha) => `hsl(var(--${name})${alpha != null ? ` / ${alpha}` : ''})`

// Exports
const menu = ref(false)
const exporting = ref('')
const base = () => safeFileName(props.fileName)
// The file shows the whole diagram as drawn, without the selection's highlighting.
async function svgText() {
  const keep = [selected.value, hover.value]
  selected.value = null
  hover.value = null
  await nextTick()
  try { return drawnSvg() } finally { [selected.value, hover.value] = keep }
}
function drawnSvg() {
  const src = svg.value
  const b = diagramBounds(graph.value, pos)
  const clone = src.cloneNode(true)
  // Inline the colours and fonts the theme gives each element, so the file stands alone.
  const a = [src, ...src.querySelectorAll('*')], c = [clone, ...clone.querySelectorAll('*')]
  a.forEach((el, i) => {
    const cs = getComputedStyle(el)
    for (const p of ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'font-family', 'font-size', 'font-weight']) {
      const v = cs.getPropertyValue(p)
      if (v) c[i].setAttribute(p, v)
    }
    c[i].removeAttribute('style')
    c[i].removeAttribute('class')
  })
  clone.querySelector('g[data-viewport]').setAttribute('transform', '')
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('viewBox', `${b.x} ${b.y} ${b.width} ${b.height}`)
  clone.setAttribute('width', String(Math.round(b.width)))
  clone.setAttribute('height', String(Math.round(b.height)))
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  Object.entries({ x: b.x, y: b.y, width: b.width, height: b.height, fill: getComputedStyle(box.value).backgroundColor }).forEach(([k, v]) => bg.setAttribute(k, v))
  clone.insertBefore(bg, clone.firstChild)
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`
}
async function pngBlob(text) {
  const img = new Image()
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`
  await img.decode()
  const scale = Math.min(2, 16000 / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
  return await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('the image is too large'))), 'image/png'))
}
const EXPORTS = [
  ['svg', 'SVG image (.svg)'],
  ['png', 'PNG image (.png)'],
  ['md', 'Markdown with Mermaid (.md)'],
  ['mmd', 'Mermaid (.mmd)'],
  ['drawio', 'draw.io (.drawio)'],
  ['dot', 'Graphviz (.dot)'],
  ['copy', 'Copy Mermaid'],
]
async function doExport(kind) {
  menu.value = false
  exporting.value = ''
  try {
    const g = graph.value
    if (kind === 'svg') saveBlob(new Blob([await svgText()], { type: 'image/svg+xml' }), `${base()}.svg`)
    else if (kind === 'png') saveBlob(await pngBlob(await svgText()), `${base()}.png`)
    else if (kind === 'md') saveBlob(new Blob([toDiagramMarkdown(g, { title: props.title, subtitle: props.subtitle })], { type: 'text/markdown' }), `${base()}.md`)
    else if (kind === 'mmd') saveBlob(new Blob([toMermaid(g)], { type: 'text/plain' }), `${base()}.mmd`)
    else if (kind === 'drawio') saveBlob(new Blob([toDrawio(g, pos)], { type: 'application/xml' }), `${base()}.drawio`)
    else if (kind === 'dot') saveBlob(new Blob([toDot(g)], { type: 'text/vnd.graphviz' }), `${base()}.dot`)
    else if (kind === 'copy') { await navigator.clipboard.writeText(toMermaid(g)); exporting.value = 'Copied the Mermaid text.' }
  } catch (err) {
    exporting.value = `Export failed: ${err.message}`
  }
}
function onDoc(e) { if (menu.value && !e.target.closest?.('[data-export-menu]')) menu.value = false }
onMounted(() => document.addEventListener('pointerdown', onDoc, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDoc, true))

const relCount = computed(() => graph.value.edges.filter((e) => e.kind === 'rel').length)
</script>

<template>
  <div class="space-y-2">
    <div class="flex flex-wrap items-center gap-2 text-sm">
      <label class="flex items-center gap-1.5">Fields
        <select v-model="fields" class="border rounded-md px-2 py-1 bg-background">
          <option value="keys">Keys and joins</option><option value="all">All fields</option><option value="none">None</option>
        </select>
      </label>
      <label v-if="!streams" class="flex items-center gap-1.5"><input v-model="sources" type="checkbox" /> Data lake objects mapped in</label>
      <div class="relative">
        <input v-model="search" placeholder="Find a box" class="border rounded-md px-2 py-1 bg-background w-48" @keydown.enter="onSearchEnter" />
        <ul v-if="matches.length && search.trim()" class="absolute z-20 mt-1 w-72 max-h-60 overflow-auto border rounded-md bg-card shadow-lg text-sm">
          <li v-for="n in matches.slice(0, 20)" :key="n.id"><button class="w-full text-left px-2 py-1 hover:bg-accent" @click="focusNode(n.id); search = ''">{{ n.label }} <span class="font-mono text-xs text-muted-foreground">{{ n.name }}</span></button></li>
        </ul>
      </div>
      <span class="text-xs text-muted-foreground">{{ graph.nodes.length }} boxes, {{ relCount }} relationships</span>
      <div class="ml-auto flex items-center gap-1">
        <button class="p-1.5 rounded-md border hover:bg-accent" title="Zoom in (+)" aria-label="Zoom in" @click="zoomButton(1.2)"><ZoomIn class="w-4 h-4" /></button>
        <button class="p-1.5 rounded-md border hover:bg-accent" title="Zoom out (-)" aria-label="Zoom out" @click="zoomButton(1 / 1.2)"><ZoomOut class="w-4 h-4" /></button>
        <button class="p-1.5 rounded-md border hover:bg-accent" title="Fit to the window (0)" aria-label="Fit" @click="fit"><Maximize class="w-4 h-4" /></button>
        <button class="p-1.5 rounded-md border hover:bg-accent" title="Lay out again (undoes moved boxes)" aria-label="Lay out again" @click="relayout"><RotateCcw class="w-4 h-4" /></button>
        <div class="relative" data-export-menu>
          <button class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-sm hover:bg-accent disabled:opacity-50" :disabled="!graph.nodes.length" :aria-expanded="menu" @click="menu = !menu"><Download class="w-4 h-4" /> Export</button>
          <div v-if="menu" role="menu" class="absolute right-0 z-20 mt-1 w-60 border rounded-md bg-card shadow-lg py-1">
            <button v-for="[k, label] in EXPORTS" :key="k" role="menuitem" class="block w-full text-left px-3 py-1.5 text-sm hover:bg-accent" @click="doExport(k)">{{ label }}</button>
          </div>
        </div>
      </div>
    </div>
    <p v-if="exporting" class="text-xs text-muted-foreground">{{ exporting }}</p>
    <p v-if="layoutError" class="text-sm text-destructive">{{ layoutError }}</p>

    <div class="flex gap-3 items-stretch">
      <div
        ref="box" tabindex="0" aria-label="Data model diagram. Drag to pan, wheel to zoom, click a box for its relationships."
        class="relative flex-1 min-w-0 h-[calc(100vh-14rem)] min-h-96 border rounded-md bg-background overflow-hidden cursor-grab active:cursor-grabbing focus:outline-none focus:ring-1 focus:ring-ring select-none"
        @wheel="onWheel" @pointerdown="onPointerDown($event)" @keydown="onKey"
      >
        <p v-if="laying && !placed.length" class="absolute inset-0 grid place-items-center text-sm text-muted-foreground">Laying out…</p>
        <p v-else-if="!graph.nodes.length" class="absolute inset-0 grid place-items-center text-sm text-muted-foreground">No data model objects to draw.</p>
        <svg ref="svg" class="w-full h-full" font-family="ui-sans-serif, system-ui, sans-serif">
          <defs>
            <marker id="dci-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" :style="{ fill: T('muted-foreground') }" /></marker>
          </defs>
          <g data-viewport :transform="`translate(${view.x},${view.y}) scale(${view.k})`">
            <g v-for="p in paths" :key="p.e.id" :style="{ opacity: edgeDim(p.e) ? 0.12 : 1 }">
              <path
                :d="p.d" fill="none" :marker-end="p.e.kind !== 'rel' ? 'url(#dci-arrow)' : undefined"
                :style="{ stroke: p.e.kind !== 'rel' ? T('muted-foreground') : T('foreground', 0.55), strokeWidth: selected && (p.e.from === selected || p.e.to === selected) ? 2.2 : 1.3, strokeDasharray: p.e.kind !== 'rel' ? '5 4' : 'none' }"
              />
              <text v-if="p.e.kind === 'rel' && cardinalityText(p.e.cardinality)" :x="p.mid.x" :y="p.mid.y - 4" text-anchor="middle" font-size="10" :style="{ fill: T('muted-foreground') }">{{ cardinalityText(p.e.cardinality) }}</text>
            </g>
            <g
              v-for="n in placed" :key="n.id" :transform="`translate(${pos[n.id].x},${pos[n.id].y})`" class="cursor-pointer"
              :style="{ opacity: dim(n.id) ? 0.25 : 1 }"
              @pointerdown.stop="onPointerDown($event, n.id)" @pointerenter="hover = n.id" @pointerleave="hover = null"
            >
              <rect :width="n.width" :height="n.height" rx="5" :style="{ fill: T('card'), stroke: selected === n.id ? T('foreground') : T('border'), strokeWidth: selected === n.id ? 2 : 1, strokeDasharray: n.kind === 'DLO' ? '5 3' : 'none' }" />
              <rect :width="4" :height="n.height" rx="2" :style="{ fill: stripe(n) }" />
              <text x="12" y="17" font-size="12" font-weight="600" :style="{ fill: T('foreground') }">{{ n.label.length > 42 ? `${n.label.slice(0, 41)}…` : n.label }}</text>
              <text x="12" y="32" font-size="10" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" :style="{ fill: T('muted-foreground') }">{{ (n.kind === 'STREAM' ? n.category || n.name : n.name).slice(0, 50) }}</text>
              <template v-if="n.fields.length">
                <line x1="4" :x2="n.width" :y1="NODE.header" :y2="NODE.header" :style="{ stroke: T('border') }" />
                <g v-for="(f, i) in n.fields" :key="f.name" :transform="`translate(0,${NODE.header + NODE.pad + i * NODE.row})`">
                  <text x="12" :y="NODE.row - 5" font-size="10" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" :style="{ fill: T('foreground') }">
                    <tspan font-weight="600" :style="{ fill: f.pk ? '#b45309' : f.fk ? T('link') : T('muted-foreground') }">{{ f.pk ? 'PK ' : f.fk ? 'FK ' : '   ' }}</tspan>{{ f.name }}
                  </text>
                  <text :x="n.width - 8" :y="NODE.row - 5" text-anchor="end" font-size="9" :style="{ fill: T('muted-foreground') }">{{ f.type }}</text>
                </g>
              </template>
            </g>
          </g>
        </svg>
        <div class="absolute left-2 bottom-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground bg-card/90 border rounded px-2 py-1 pointer-events-none">
          <span v-for="(c, k) in CATEGORY" :key="k" class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-sm" :style="{ background: c }" />{{ k }}</span>
          <span v-if="streams" class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-sm" :style="{ background: STREAM_COLOUR }" />Data stream</span>
          <span v-if="sources || streams" class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-sm border border-dashed border-muted-foreground" />DLO</span>
          <span>{{ Math.round(view.k * 100) }}%</span>
        </div>
      </div>

      <aside v-if="selNode" class="w-72 shrink-0 border rounded-md bg-card p-3 text-sm space-y-2 overflow-auto h-[calc(100vh-14rem)] min-h-96" aria-label="Selected object">
        <div>
          <div class="font-medium">{{ selNode.label }}</div>
          <div class="font-mono text-xs text-muted-foreground break-all">{{ selNode.name }}</div>
          <div class="text-xs text-muted-foreground">{{ selNode.kind === 'STREAM' ? `Data stream${selNode.category ? `, ${selNode.category}` : ''}${selNode.status ? `, last run ${selNode.status.toLowerCase()}` : ''}` : `${selNode.kind}${selNode.category ? `, ${selNode.category.replace(/_/g, ' ')}` : ''}, ${selNode.fieldCount} fields` }}</div>
        </div>
        <RouterLink :to="selNode.kind === 'STREAM' ? `/streams/${selNode.name}` : `/objects/${selNode.name}`" class="text-xs text-link hover:underline">{{ selNode.kind === 'STREAM' ? 'Open the data stream' : 'Open in Objects' }}</RouterLink>
        <div v-if="selNode.fields.some((f) => f.pk)" class="text-xs"><Key class="inline w-3 h-3" /> {{ selNode.fields.filter((f) => f.pk).map((f) => f.name).join(', ') }}</div>
        <div>
          <div class="text-xs text-muted-foreground mb-1">Drawn connections ({{ selEdges.length }})</div>
          <ul class="space-y-1.5">
            <li v-for="e in selEdges" :key="e.id" class="text-xs">
              <button class="text-link hover:underline text-left" @click="focusNode(other(e).id)"><Link2 class="inline w-3 h-3" /> {{ other(e).label }}</button>
              <div v-if="e.kind === 'rel'" class="font-mono text-muted-foreground break-all">{{ e.fromField }} = {{ e.toField }} <span class="font-sans">{{ cardinalityText(e.cardinality) || e.cardinality }}</span></div>
              <div v-else-if="e.kind === 'feed'" class="text-muted-foreground">{{ byId.get(e.from)?.label }} feeds {{ byId.get(e.to)?.label }}</div>
              <div v-else class="text-muted-foreground">maps {{ e.count }} fields into {{ byId.get(e.to)?.label }}</div>
            </li>
          </ul>
          <p v-if="selNode.outside" class="text-xs text-muted-foreground mt-2">{{ selNode.outside }} more {{ selNode.outside === 1 ? 'relationship' : 'relationships' }} to objects not in this diagram (switch to All DMOs to see them).</p>
        </div>
      </aside>
    </div>
    <p class="text-xs text-muted-foreground">Drag the background to pan, the wheel to zoom, drag a box to move it, click a box to see its connections. Esc clears the selection.</p>
  </div>
</template>
