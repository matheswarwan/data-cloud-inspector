<script setup>
// Query builder, Visual mode: the tables as boxes and the joins as lines (join type and
// condition on the line), laid out with dagre. Drag the background to pan, the wheel to zoom,
// drag a box to move it; click a box to edit it beside the canvas.
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { ZoomIn, ZoomOut, Maximize, RotateCcw } from 'lucide-vue-next'
import { aliasAt, onClause } from '../../lib/builderModel.js'

const props = defineProps({
  q: { type: Object, required: true },
  catalog: { type: Array, required: true },
  selected: { type: String, default: null },
})
const emit = defineEmits(['select'])

const W = 230
const H = 62
const nodes = computed(() => props.q.tables.map((t, i) => {
  const o = props.catalog.find((x) => x.name === t.name)
  const total = o?.fields.length || 0
  return { id: t.id, alias: aliasAt(i), label: o?.label || t.name, name: t.name, kind: o?.kind || '', fields: Array.isArray(t.fields) ? t.fields.length : total, total }
}))
const edges = computed(() => props.q.joins.map((j) => {
  const li = props.q.tables.findIndex((t) => t.id === j.leftId)
  const ri = props.q.tables.findIndex((t) => t.id === j.tableId)
  const on = li >= 0 && ri >= 0 ? onClause(j, aliasAt(li), aliasAt(ri)).replace(/\s+/g, ' ') : ''
  return { id: j.tableId, from: j.leftId, to: j.tableId, label: `${j.type.replace(' JOIN', '').toLowerCase()} join`, on, ok: !!on }
}))

const pos = reactive({})
const view = reactive({ x: 0, y: 0, k: 1 })
const box = ref(null)
let dagre = null
async function layout(keep = true) {
  dagre ||= await import('@dagrejs/dagre')
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 140, marginx: 20, marginy: 20 })
  g.setDefaultEdgeLabel(() => ({}))
  for (const n of nodes.value) g.setNode(n.id, { width: W, height: H })
  for (const e of edges.value) if (e.from && e.to) g.setEdge(e.from, e.to)
  dagre.layout(g)
  for (const n of nodes.value) if (!keep || !pos[n.id]) { const p = g.node(n.id); pos[n.id] = { x: p.x - W / 2, y: p.y - H / 2 } }
  for (const k of Object.keys(pos)) if (!nodes.value.some((n) => n.id === k)) delete pos[k]
  if (!keep) fit()
}
onMounted(() => layout(false).then(fit))
watch(() => nodes.value.map((n) => n.id).join(','), () => layout(true))

function fit() {
  if (!box.value || !nodes.value.length) return
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
  for (const n of nodes.value) { const p = pos[n.id]; if (!p) continue; x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y); x2 = Math.max(x2, p.x + W); y2 = Math.max(y2, p.y + H) }
  const r = box.value.getBoundingClientRect()
  const k = Math.min(1.1, Math.max(0.2, Math.min((r.width - 40) / (x2 - x1), (r.height - 40) / (y2 - y1))))
  Object.assign(view, { k, x: (r.width - (x2 - x1) * k) / 2 - x1 * k, y: (r.height - (y2 - y1) * k) / 2 - y1 * k })
}
function zoom(f, cx, cy) {
  const k = Math.min(2.5, Math.max(0.15, view.k * f))
  view.x = cx - ((cx - view.x) * k) / view.k; view.y = cy - ((cy - view.y) * k) / view.k; view.k = k
}
const zoomBtn = (f) => { const r = box.value.getBoundingClientRect(); zoom(f, r.width / 2, r.height / 2) }
function onWheel(e) { e.preventDefault(); const r = box.value.getBoundingClientRect(); zoom(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top) }
function down(e, id = null) {
  if (e.button !== 0) return
  e.preventDefault()
  const s = { x: e.clientX, y: e.clientY, from: id ? { ...pos[id] } : { x: view.x, y: view.y }, moved: false }
  const move = (ev) => {
    const dx = ev.clientX - s.x, dy = ev.clientY - s.y
    if (Math.abs(dx) + Math.abs(dy) > 3) s.moved = true
    if (id) pos[id] = { x: s.from.x + dx / view.k, y: s.from.y + dy / view.k }
    else { view.x = s.from.x + dx; view.y = s.from.y + dy }
  }
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (!s.moved) emit('select', id) }
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
}
function path(e) {
  const a = pos[e.from], b = pos[e.to]
  if (!a || !b) return { d: '', mid: { x: 0, y: 0 } }
  const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x, y2 = b.y + H / 2
  const c = Math.max(50, Math.abs(x2 - x1) / 2)
  return { d: `M${x1},${y1} C${x1 + c},${y1} ${x2 - c},${y2} ${x2},${y2}`, mid: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 } }
}
const T = (n, a) => `hsl(var(--${n})${a != null ? ` / ${a}` : ''})`
const KIND = { DMO: '#2563eb', DLO: '#94a3b8', CI: '#7c3aed' }
const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
</script>

<template>
  <div ref="box" class="relative h-full min-h-80 border rounded-md bg-background overflow-hidden cursor-grab active:cursor-grabbing select-none" @wheel="onWheel" @pointerdown="down($event)">
    <p v-if="!nodes.length" class="absolute inset-0 grid place-items-center text-sm text-muted-foreground">Add an object from the list on the left.</p>
    <svg class="w-full h-full" font-family="ui-sans-serif, system-ui, sans-serif">
      <defs><marker id="qb-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" :style="{ fill: T('muted-foreground') }" /></marker></defs>
      <g :transform="`translate(${view.x},${view.y}) scale(${view.k})`">
        <g v-for="e in edges" :key="e.id">
          <path :d="path(e).d" fill="none" marker-end="url(#qb-arrow)" :style="{ stroke: e.ok ? T('foreground', 0.55) : '#d97706', strokeWidth: 1.5, strokeDasharray: e.ok ? 'none' : '5 4' }" />
          <text :x="path(e).mid.x" :y="path(e).mid.y - 16" text-anchor="middle" font-size="11" font-weight="600" :style="{ fill: T('foreground') }">{{ e.label }}</text>
          <text :x="path(e).mid.x" :y="path(e).mid.y - 3" text-anchor="middle" font-size="10" font-family="ui-monospace, monospace" :style="{ fill: e.ok ? T('muted-foreground') : '#b45309' }">{{ e.ok ? cut(e.on, 60) : 'set the join condition' }}</text>
        </g>
        <g v-for="n in nodes" :key="n.id" :transform="pos[n.id] ? `translate(${pos[n.id].x},${pos[n.id].y})` : ''" class="cursor-pointer" @pointerdown.stop="down($event, n.id)">
          <rect :width="W" :height="H" rx="6" :style="{ fill: T('card'), stroke: selected === n.id ? T('foreground') : T('border'), strokeWidth: selected === n.id ? 2 : 1 }" />
          <rect width="4" :height="H" rx="2" :fill="KIND[n.kind] || '#64748b'" />
          <text x="12" y="19" font-size="12" font-weight="600" :style="{ fill: T('foreground') }"><tspan font-family="ui-monospace, monospace" :style="{ fill: T('muted-foreground') }">{{ n.alias }} </tspan>{{ cut(n.label, 26) }}</text>
          <text x="12" y="35" font-size="10" font-family="ui-monospace, monospace" :style="{ fill: T('muted-foreground') }">{{ cut(n.name, 34) }}</text>
          <text x="12" y="52" font-size="10" :style="{ fill: T('muted-foreground') }">{{ n.kind }} · {{ n.fields }} of {{ n.total }} fields</text>
        </g>
      </g>
    </svg>
    <div class="absolute right-2 top-2 flex gap-1" @pointerdown.stop>
      <button class="dci-btn-icon dci-btn-sm" aria-label="Zoom in" @click="zoomBtn(1.2)"><ZoomIn class="w-3.5 h-3.5" /></button>
      <button class="dci-btn-icon dci-btn-sm" aria-label="Zoom out" @click="zoomBtn(1 / 1.2)"><ZoomOut class="w-3.5 h-3.5" /></button>
      <button class="dci-btn-icon dci-btn-sm" aria-label="Fit" @click="fit"><Maximize class="w-3.5 h-3.5" /></button>
      <button class="dci-btn-icon dci-btn-sm" aria-label="Lay out again" title="Lay out again" @click="layout(false)"><RotateCcw class="w-3.5 h-3.5" /></button>
    </div>
  </div>
</template>
