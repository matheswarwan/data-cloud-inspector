<script setup>
// A flow drawn as a flow (feedback #1016): Start, then each element as a box coloured by
// kind, arrows labelled with decision outcomes, wait events, loop paths and faults, laid
// out top to bottom with dagre. Drag to pan, wheel to zoom; Download as PNG or SVG.
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { ZoomIn, ZoomOut, Maximize, Download } from 'lucide-vue-next'
import { standaloneSvg, pngBlob } from '../lib/svgImage.js'
import { saveBlob } from '../lib/exportDoc.js'

const props = defineProps({ steps: { type: Array, required: true }, startLinks: { type: Array, default: () => [] }, startText: { type: String, default: '' }, fileName: { type: String, default: 'flow' } })
const W = 230, H = 54
const KIND = {
  Start: '#2E844A', Action: '#0176D3', Decision: '#DD7A01', Wait: '#9050E9', Loop: '#3BA755', Assignment: '#FF538A',
  'Get records': '#E3066A', 'Create records': '#E3066A', 'Update records': '#E3066A', 'Delete records': '#E3066A',
  Subflow: '#032D60', Screen: '#0B827C', Error: '#BA0517',
}
const graph = computed(() => {
  const names = new Set(props.steps.map((s) => s.name))
  const nodes = [{ id: '__start', label: 'Start', type: 'Start', detail: props.startText }, ...props.steps.map((s) => ({ id: s.name, label: s.label, type: s.type, detail: s.detail }))]
  const edges = [...props.startLinks.map((l) => ({ from: '__start', ...l })), ...props.steps.flatMap((s) => (s.links || []).map((l) => ({ from: s.name, ...l })))]
    .filter((e) => names.has(e.to))
  return { nodes, edges }
})
const pos = reactive({})
const edgePts = reactive({})
const view = reactive({ x: 0, y: 0, k: 1 })
const box = ref(null)
const svgEl = ref(null)
const error = ref('')
const menu = ref(false)

async function layout() {
  error.value = ''
  try {
    const dagre = await import('@dagrejs/dagre')
    const g = new dagre.graphlib.Graph({ multigraph: true })
    g.setGraph({ rankdir: 'TB', nodesep: 30, ranksep: 46, marginx: 10, marginy: 10 })
    g.setDefaultEdgeLabel(() => ({}))
    for (const n of graph.value.nodes) g.setNode(n.id, { width: W, height: H })
    graph.value.edges.forEach((e, i) => g.setEdge(e.from, e.to, { label: e.label, width: e.label ? Math.min(160, e.label.length * 6 + 10) : 0, height: e.label ? 14 : 0 }, `e${i}`))
    dagre.layout(g)
    for (const k of Object.keys(pos)) delete pos[k]
    for (const k of Object.keys(edgePts)) delete edgePts[k]
    for (const n of graph.value.nodes) { const p = g.node(n.id); pos[n.id] = { x: p.x - W / 2, y: p.y - H / 2 } }
    graph.value.edges.forEach((e, i) => { const ed = g.edge({ v: e.from, w: e.to, name: `e${i}` }); edgePts[i] = { points: ed.points, x: ed.x, y: ed.y } })
    start()
  } catch (err) { error.value = `Could not draw the flow: ${err.message}` }
}
onMounted(layout)
watch(graph, layout)

function bounds() {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
  for (const n of graph.value.nodes) { const p = pos[n.id]; if (!p) continue; x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y); x2 = Math.max(x2, p.x + W); y2 = Math.max(y2, p.y + H) }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
}
function fit() {
  if (!box.value || !graph.value.nodes.length) return
  const b = bounds(), r = box.value.getBoundingClientRect()
  const k = Math.min(1, Math.max(0.1, Math.min((r.width - 20) / b.width, (r.height - 20) / b.height)))
  Object.assign(view, { k, x: (r.width - b.width * k) / 2 - b.x * k, y: 10 - b.y * k })
}
// Opening view: the whole flow when it fits at a readable size, else its top at that size.
function start() {
  if (!box.value || !graph.value.nodes.length) return
  const b = bounds(), r = box.value.getBoundingClientRect()
  const whole = Math.min(1, (r.width - 20) / b.width, (r.height - 20) / b.height)
  if (whole >= 0.6) return fit()
  const k = Math.min(1, Math.max(0.6, (r.width - 20) / b.width))
  Object.assign(view, { k, x: (r.width - b.width * k) / 2 - b.x * k, y: 10 - b.y * k })
}
function zoom(f, cx, cy) {
  const k = Math.min(3, Math.max(0.1, view.k * f))
  view.x = cx - ((cx - view.x) * k) / view.k; view.y = cy - ((cy - view.y) * k) / view.k; view.k = k
}
const zoomBtn = (f) => { const r = box.value.getBoundingClientRect(); zoom(f, r.width / 2, r.height / 2) }
function onWheel(e) { e.preventDefault(); const r = box.value.getBoundingClientRect(); zoom(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top) }
function down(e) {
  if (e.button !== 0) return
  const d = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }
  const move = (ev) => { view.x = d.vx + ev.clientX - d.x; view.y = d.vy + ev.clientY - d.y }
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
}
const pathOf = (i) => { const pts = edgePts[i]?.points || []; return pts.length ? `M${pts.map((p) => `${p.x},${p.y}`).join(' L')}` : '' }
async function download(kind) {
  menu.value = false
  try {
    const text = standaloneSvg(svgEl.value, bounds(), getComputedStyle(box.value).backgroundColor)
    if (kind === 'svg') saveBlob(new Blob([text], { type: 'image/svg+xml' }), `${props.fileName}.svg`)
    else saveBlob(await pngBlob(text), `${props.fileName}.png`)
  } catch (e) { error.value = `Could not make the image: ${e.message}` }
}
const T = (n) => `hsl(var(--${n}))`
const cut = (t, n) => (t && t.length > n ? `${t.slice(0, n - 1)}…` : t || '')
</script>

<template>
  <div ref="box" class="relative border rounded-md bg-background overflow-hidden h-[65vh] min-h-80 cursor-grab active:cursor-grabbing select-none" @wheel="onWheel" @pointerdown="down">
    <p v-if="error" class="p-3 text-sm text-destructive">{{ error }}</p>
    <svg ref="svgEl" class="w-full h-full" font-family="ui-sans-serif, system-ui, sans-serif">
      <defs><marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#74797F" /></marker></defs>
      <g data-viewport :transform="`translate(${view.x},${view.y}) scale(${view.k})`">
        <g v-for="(e, i) in graph.edges" :key="`e${i}`">
          <path :d="pathOf(i)" fill="none" :stroke="e.fault ? '#BA0517' : '#74797F'" stroke-width="1.5" :stroke-dasharray="e.fault ? '5 3' : 'none'" marker-end="url(#flow-arrow)" />
          <text v-if="e.label && edgePts[i]" :x="edgePts[i].x" :y="edgePts[i].y + 4" text-anchor="middle" font-size="10" :style="{ fill: T('muted-foreground') }">{{ cut(e.label, 28) }}</text>
        </g>
        <g v-for="n in graph.nodes" :key="n.id" :transform="pos[n.id] ? `translate(${pos[n.id].x},${pos[n.id].y})` : ''">
          <rect :width="W" :height="H" :rx="n.type === 'Start' ? 27 : 6" :style="{ fill: T('card'), stroke: T('border') }" />
          <rect :width="6" :height="H" rx="3" :fill="KIND[n.type] || '#74797F'" />
          <text x="14" y="20" font-size="11" font-weight="600" :style="{ fill: T('foreground') }">{{ cut(n.label, 30) }}</text>
          <text x="14" y="38" font-size="10" :style="{ fill: T('muted-foreground') }">{{ cut(n.type === 'Start' ? n.detail || 'Start' : [n.type, n.detail].filter(Boolean).join(': '), 38) }}</text>
        </g>
      </g>
    </svg>
    <div class="absolute right-2 top-2 flex gap-1" @pointerdown.stop>
      <button class="p-1 rounded border bg-card hover:bg-accent" aria-label="Zoom in" @click="zoomBtn(1.2)"><ZoomIn class="w-3.5 h-3.5" /></button>
      <button class="p-1 rounded border bg-card hover:bg-accent" aria-label="Zoom out" @click="zoomBtn(1 / 1.2)"><ZoomOut class="w-3.5 h-3.5" /></button>
      <button class="p-1 rounded border bg-card hover:bg-accent" aria-label="Fit" title="Show the whole flow" @click="fit"><Maximize class="w-3.5 h-3.5" /></button>
      <div class="relative">
        <button class="p-1 rounded border bg-card hover:bg-accent" aria-label="Download the flow" title="Download the flow as an image" :aria-expanded="menu" @click="menu = !menu"><Download class="w-3.5 h-3.5" /></button>
        <div v-if="menu" class="absolute right-0 mt-1 z-10 w-40 rounded-md border bg-card shadow-lg py-1 text-xs" role="menu">
          <button role="menuitem" class="block w-full text-left px-3 py-1.5 hover:bg-accent" @click="download('png')">PNG image (.png)</button>
          <button role="menuitem" class="block w-full text-left px-3 py-1.5 hover:bg-accent" @click="download('svg')">SVG image (.svg)</button>
        </div>
      </div>
    </div>
  </div>
</template>
