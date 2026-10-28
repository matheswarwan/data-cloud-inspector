<script setup>
// The Graph view of JsonViewer: each object or array as a box with its plain values, lines to
// its children, laid out with dagre. Drag to pan, wheel to zoom, click a box to copy its path.
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { ZoomIn, ZoomOut, Maximize, Download } from 'lucide-vue-next'
import { standaloneSvg, pngBlob } from '../lib/svgImage.js'
import { saveBlob } from '../lib/exportDoc.js'
import { jsonGraph } from '../lib/jsonView.js'

const props = defineProps({ value: { required: true }, copy: { type: Function, required: true }, fileName: { type: String, default: 'graph' } })
const graph = computed(() => jsonGraph(props.value))
const pos = reactive({})
const view = reactive({ x: 0, y: 0, k: 1 })
const box = ref(null)
const error = ref('')

async function layout() {
  error.value = ''
  try {
    const dagre = await import('@dagrejs/dagre')
    const g = new dagre.graphlib.Graph()
    g.setGraph({ rankdir: 'LR', nodesep: 18, ranksep: 60, marginx: 10, marginy: 10 })
    g.setDefaultEdgeLabel(() => ({}))
    for (const n of graph.value.nodes) g.setNode(n.id, { width: n.width, height: n.height })
    for (const e of graph.value.edges) g.setEdge(e.from, e.to)
    dagre.layout(g)
    for (const k of Object.keys(pos)) delete pos[k]
    for (const n of graph.value.nodes) { const p = g.node(n.id); pos[n.id] = { x: p.x - n.width / 2, y: p.y - n.height / 2 } }
    fit()
  } catch (err) { error.value = `Could not draw the graph: ${err.message}` }
}
onMounted(layout)
watch(graph, layout)

function fit() {
  if (!box.value || !graph.value.nodes.length) return
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
  for (const n of graph.value.nodes) { const p = pos[n.id]; if (!p) continue; x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y); x2 = Math.max(x2, p.x + n.width); y2 = Math.max(y2, p.y + n.height) }
  const r = box.value.getBoundingClientRect()
  const k = Math.min(1, Math.max(0.1, Math.min((r.width - 20) / (x2 - x1), (r.height - 20) / (y2 - y1))))
  Object.assign(view, { k, x: (r.width - (x2 - x1) * k) / 2 - x1 * k, y: 10 - y1 * k })
}
function zoom(f, cx, cy) {
  const k = Math.min(3, Math.max(0.1, view.k * f))
  view.x = cx - ((cx - view.x) * k) / view.k; view.y = cy - ((cy - view.y) * k) / view.k; view.k = k
}
const zoomBtn = (f) => { const r = box.value.getBoundingClientRect(); zoom(f, r.width / 2, r.height / 2) }
function onWheel(e) { e.preventDefault(); const r = box.value.getBoundingClientRect(); zoom(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top) }
let drag = null
function down(e) {
  if (e.button !== 0) return
  drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }
  const move = (ev) => { view.x = drag.vx + ev.clientX - drag.x; view.y = drag.vy + ev.clientY - drag.y }
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); drag = null }
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
}
const path = (a, b) => {
  const pa = pos[a.id], pb = pos[b.id]
  if (!pa || !pb) return ''
  const x1 = pa.x + a.width, y1 = pa.y + 13, x2 = pb.x, y2 = pb.y + 13, c = Math.max(30, (x2 - x1) / 2)
  return `M${x1},${y1} C${x1 + c},${y1} ${x2 - c},${y2} ${x2},${y2}`
}
// Download the whole graph as an image (feedback #1010).
const svgEl = ref(null)
const menu = ref(false)
function bounds() {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
  for (const n of graph.value.nodes) { const p = pos[n.id]; if (!p) continue; x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y); x2 = Math.max(x2, p.x + n.width); y2 = Math.max(y2, p.y + n.height) }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
}
async function download(kind) {
  menu.value = false
  try {
    const text = standaloneSvg(svgEl.value, bounds(), getComputedStyle(box.value).backgroundColor)
    const name = `${props.fileName || 'graph'}-graph`
    if (kind === 'svg') saveBlob(new Blob([text], { type: 'image/svg+xml' }), `${name}.svg`)
    else saveBlob(await pngBlob(text), `${name}.png`)
  } catch (e) { error.value = `Could not make the image: ${e.message}` }
}
const byId = computed(() => new Map(graph.value.nodes.map((n) => [n.id, n])))
const sizeText = (n) => (n.kind === 'array' ? `[${n.size}]` : ['{', n.size, '}'].join(''))
const T = (n) => `hsl(var(--${n}))`
const TYPE = { string: '#047857', number: '#0369a1', boolean: '#6d28d9', null: '#64748b' }
</script>

<template>
  <div class="relative border rounded-md bg-background overflow-hidden h-[60vh] min-h-72 cursor-grab active:cursor-grabbing select-none" ref="box" @wheel="onWheel" @pointerdown="down">
    <p v-if="error" class="p-3 text-sm text-destructive">{{ error }}</p>
    <svg ref="svgEl" class="w-full h-full" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">
      <g data-viewport :transform="`translate(${view.x},${view.y}) scale(${view.k})`">
        <g v-for="e in graph.edges" :key="e.id">
          <path :d="path(byId.get(e.from), byId.get(e.to))" fill="none" :style="{ stroke: T('muted-foreground'), strokeWidth: 1 }" />
        </g>
        <g v-for="n in graph.nodes" :key="n.id" :transform="pos[n.id] ? `translate(${pos[n.id].x},${pos[n.id].y})` : ''" class="cursor-pointer" @pointerdown.stop @click="copy(n.path, 'the path')">
          <rect :width="n.width" :height="n.height" rx="5" :style="{ fill: T('card'), stroke: T('border') }" />
          <text x="8" y="17" font-size="11" font-weight="600" :style="{ fill: T('foreground') }">{{ n.title.length > 48 ? `${n.title.slice(0, 47)}…` : n.title }} <tspan font-weight="400" :style="{ fill: T('muted-foreground') }">{{ sizeText(n) }}</tspan></text>
          <line x1="0" :x2="n.width" y1="24" y2="24" :style="{ stroke: T('border') }" />
          <text v-for="(r, i) in n.rows" :key="i" x="8" :y="38 + i * 16" font-size="10">
            <tspan :style="{ fill: T('muted-foreground') }">{{ r.k }}{{ r.k ? ': ' : '' }}</tspan><tspan :fill="TYPE[r.type] || 'currentColor'">{{ r.v }}</tspan>
          </text>
          <text v-if="n.more" x="8" :y="38 + n.rows.length * 16" font-size="10" :style="{ fill: T('muted-foreground') }">and {{ n.more }} more</text>
        </g>
      </g>
    </svg>
    <div class="absolute right-2 top-2 flex gap-1" @pointerdown.stop>
      <button class="p-1 rounded border bg-card hover:bg-accent" aria-label="Zoom in" @click="zoomBtn(1.2)"><ZoomIn class="w-3.5 h-3.5" /></button>
      <button class="p-1 rounded border bg-card hover:bg-accent" aria-label="Zoom out" @click="zoomBtn(1 / 1.2)"><ZoomOut class="w-3.5 h-3.5" /></button>
      <button class="p-1 rounded border bg-card hover:bg-accent" aria-label="Fit" @click="fit"><Maximize class="w-3.5 h-3.5" /></button>
      <div class="relative">
        <button class="p-1 rounded border bg-card hover:bg-accent" aria-label="Download the graph" title="Download the graph as an image" :aria-expanded="menu" :disabled="!graph.nodes.length" @click="menu = !menu"><Download class="w-3.5 h-3.5" /></button>
        <div v-if="menu" class="absolute right-0 mt-1 z-10 w-40 rounded-xl border bg-card shadow-lg py-1 text-xs" role="menu">
          <button role="menuitem" class="block w-full text-left px-3 py-1.5 hover:bg-accent" @click="download('png')">PNG image (.png)</button>
          <button role="menuitem" class="block w-full text-left px-3 py-1.5 hover:bg-accent" @click="download('svg')">SVG image (.svg)</button>
        </div>
      </div>
    </div>
    <p v-if="graph.truncated" class="absolute left-2 bottom-2 text-xs text-muted-foreground bg-card/90 border rounded px-2 py-0.5">Only the first {{ graph.nodes.length }} objects are drawn; use Tree for the rest.</p>
  </div>
</template>
