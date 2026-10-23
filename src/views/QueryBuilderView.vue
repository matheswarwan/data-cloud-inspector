<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { X } from 'lucide-vue-next'
import BuilderObject from '../components/BuilderObject.vue'
import { useOrg } from '../app/useOrg.js'
import { useCatalog, ensureCatalog, orgCall } from '../app/useCatalog.js'
import { useBuilder } from '../app/useBuilder.js'
import { emptyModel, buildSql, countSql, objectOf, OPERATORS } from '../lib/queryBuilder.js'
import { filterObjects } from '../lib/catalog.js'
import { runQuery } from '../lib/query.js'

const router = useRouter()
const org = useOrg()
const catalog = useCatalog()
const builder = computed(() => useBuilder(`${org.orgId}|${org.dataSpace}`))
const model = computed(() => builder.value.model)
onMounted(() => ensureCatalog())

const pickText = ref('')
const picking = computed(() => !model.value.base)
const pickList = computed(() => filterObjects(catalog.objects, { text: pickText.value }).slice(0, 60))
function start(name) {
  builder.value.model = { ...emptyModel(name) }
  pickText.value = ''
}

const aliases = computed(() => [{ alias: 't0', object: model.value.base }, ...model.value.joins.map((j) => ({ alias: j.alias, object: j.object }))])
const labelOf = (name) => catalog.objects.find((o) => o.name === name)?.label || name
const fieldsOf = (alias) => catalog.objects.find((o) => o.name === objectOf(model.value, alias))?.fields || []
const sql = computed(() => buildSql(model.value, catalog.objects))
const engagement = computed(() => model.value.joins.some((j) => catalog.objects.find((o) => o.name === j.object)?.category === 'Engagement'))

function addFilter() { model.value.filters.push({ alias: 't0', field: '', op: 'eq', value: '' }) }
function addSort() { model.value.orderBy.push({ alias: 't0', field: '', dir: 'ASC' }) }

const count = ref(null)
const countError = ref('')
const counting = ref(false)
async function countRows() {
  counting.value = true
  count.value = null
  countError.value = ''
  try {
    const r = await runQuery(orgCall(), org.version, countSql(model.value, catalog.objects), { rowLimit: 1 })
    count.value = Number(r.rows[0]?.[0] ?? 0)
  } catch (err) {
    countError.value = err.message
  } finally {
    counting.value = false
  }
}
const notice = ref('')
async function copy() { await navigator.clipboard.writeText(sql.value); notice.value = 'Copied the SQL.' }
function openInSql() { router.push({ path: '/sql', query: { sql: sql.value } }) }
function reset() { builder.value.model = emptyModel(); count.value = null }

const card = 'border rounded-md bg-card'
const btn = 'inline-flex items-center px-2.5 py-1.5 rounded-md border text-sm hover:bg-accent disabled:opacity-50'
const input = 'border rounded px-1.5 py-1 bg-background text-xs'
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-center gap-3">
      <div>
        <h2 class="text-lg font-semibold">Query Builder</h2>
        <p class="text-sm text-muted-foreground">Pick fields and related objects; the joins come from your org's relationships. Then open the SQL in a SQL tab.</p>
      </div>
      <div class="ml-auto flex gap-2">
        <button v-if="model.base" :class="btn" @click="reset">Start again</button>
        <RouterLink to="/sql" :class="btn">Back to SQL</RouterLink>
      </div>
    </div>

    <div v-if="picking" :class="[card, 'p-3 space-y-2 max-w-2xl']">
      <div class="text-sm font-medium">Start from</div>
      <input v-model="pickText" placeholder="Search objects, for example Individual" class="w-full border rounded-md px-2 py-1.5 bg-background text-sm" />
      <p v-if="catalog.loading" class="text-xs text-muted-foreground">Loading objects…</p>
      <ul class="max-h-96 overflow-auto text-sm">
        <li v-for="o in pickList" :key="o.name">
          <button class="w-full text-left px-2 py-1 rounded hover:bg-accent flex items-baseline gap-2" @click="start(o.name)">
            <span class="text-[10px] border rounded px-1 text-muted-foreground">{{ o.kind }}</span>
            <span>{{ o.label }}</span>
            <span class="font-mono text-xs text-muted-foreground ml-auto">{{ o.name }}</span>
          </button>
        </li>
      </ul>
    </div>

    <div v-else class="grid xl:grid-cols-[3fr_2fr] gap-4 items-start">
      <div class="space-y-2">
        <BuilderObject :model="model" alias="t0" :catalog="catalog.objects" />
        <p v-if="engagement" class="text-xs text-muted-foreground">An engagement object has many rows per person, so joining it repeats the person on each row. Use DISTINCT or a filter if that is not what you want.</p>
      </div>

      <div class="space-y-3 xl:sticky xl:top-4">
        <div :class="[card, 'p-3 space-y-2 text-sm']">
          <div class="flex items-center"><span class="font-medium">Filters</span><button class="ml-auto text-xs text-link hover:underline" @click="addFilter">Add filter</button></div>
          <p v-if="!model.filters.length" class="text-xs text-muted-foreground">No filters: every row.</p>
          <div v-for="(f, i) in model.filters" :key="i" class="flex flex-wrap items-center gap-1">
            <select v-model="f.alias" :class="input" @change="f.field = ''"><option v-for="a in aliases" :key="a.alias" :value="a.alias">{{ a.alias }} {{ labelOf(a.object) }}</option></select>
            <select v-model="f.field" :class="[input, 'max-w-48']"><option value="">field…</option><option v-for="fl in fieldsOf(f.alias)" :key="fl.name" :value="fl.name">{{ fl.name }}</option></select>
            <select v-model="f.op" :class="input"><option v-for="o in OPERATORS" :key="o.id" :value="o.id">{{ o.label }}</option></select>
            <input v-if="!OPERATORS.find((o) => o.id === f.op)?.noValue" v-model="f.value" :class="[input, 'w-32']" placeholder="value" />
            <button class="p-0.5 rounded hover:bg-accent" aria-label="Remove filter" @click="model.filters.splice(i, 1)"><X class="w-3.5 h-3.5" /></button>
          </div>
          <div class="flex items-center pt-1"><span class="font-medium">Sort</span><button class="ml-auto text-xs text-link hover:underline" @click="addSort">Add sort</button></div>
          <div v-for="(o, i) in model.orderBy" :key="`s${i}`" class="flex flex-wrap items-center gap-1">
            <select v-model="o.alias" :class="input" @change="o.field = ''"><option v-for="a in aliases" :key="a.alias" :value="a.alias">{{ a.alias }} {{ labelOf(a.object) }}</option></select>
            <select v-model="o.field" :class="[input, 'max-w-48']"><option value="">field…</option><option v-for="fl in fieldsOf(o.alias)" :key="fl.name" :value="fl.name">{{ fl.name }}</option></select>
            <select v-model="o.dir" :class="input"><option value="ASC">ascending</option><option value="DESC">descending</option></select>
            <button class="p-0.5 rounded hover:bg-accent" aria-label="Remove sort" @click="model.orderBy.splice(i, 1)"><X class="w-3.5 h-3.5" /></button>
          </div>
          <div class="flex items-center gap-4 pt-1 text-xs">
            <label class="flex items-center gap-1.5">Limit <input v-model.number="model.limit" type="number" min="0" :class="[input, 'w-20']" /></label>
            <label class="flex items-center gap-1.5"><input v-model="model.distinct" type="checkbox" /> DISTINCT rows</label>
          </div>
        </div>

        <div :class="card">
          <div class="p-2 border-b flex flex-wrap items-center gap-2">
            <span class="font-medium text-sm">SQL</span>
            <button class="ml-auto px-3 py-1 rounded-md bg-primary text-primary-foreground text-sm" @click="openInSql">Open in a SQL tab</button>
            <button :class="btn" @click="copy">Copy</button>
            <button :class="btn" :disabled="counting" @click="countRows">{{ counting ? 'Counting…' : 'Count rows' }}</button>
          </div>
          <pre class="p-3 text-xs font-mono whitespace-pre-wrap break-all max-h-96 overflow-auto">{{ sql }}</pre>
          <p v-if="count != null" class="px-3 pb-2 text-sm"><strong>{{ count.toLocaleString() }}</strong> rows without the limit.</p>
          <p v-if="countError" class="px-3 pb-2 text-xs text-destructive">{{ countError }}</p>
          <p v-if="notice" class="px-3 pb-2 text-xs text-muted-foreground">{{ notice }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
