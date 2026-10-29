// The Health page as problems first (design "Option D – Health", 2026-10-29): one score, a
// tile per area, and the problems in groups that read as sentences ("Failed activations",
// "Segments never published", "Engagement data going stale", "Inactive"). Items can be marked
// as expected so they stop counting, and each check is compared with the one before it.
import { countLevels } from './health.js'

export const itemKey = (i) => `${i.kind}:${i.name}`

const AREA_NOUN = {
  'Data streams': 'data streams', 'Identity resolution': 'rulesets', 'Calculated insights': 'calculated insights',
  Segments: 'segments', Activations: 'activations', 'Engagement data': 'engagement objects',
}
const noun = (area) => AREA_NOUN[area] || String(area || '').toLowerCase()
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

// What some statuses usually mean, shown under a group that has them.
const HINTS = [
  [/partner ?error/i, 'partnererror', 'usually means the target platform rejected the publish: expired credentials, a removed audience, or a field the partner no longer accepts. Check the activation target\'s connection first.'],
  [/timed? ?out|timeout/i, 'timeout', 'means the run took longer than Salesforce allows. Large lookbacks or joins are the usual cause; a smaller window or fewer related objects helps.'],
  [/insufficient|permission|access denied|not authori[sz]ed/i, 'permission', 'means the user or the integration behind the run lacks access. Check the connector credentials and the data space permissions.'],
]

/** A short status word from a reason ("Last publish: partnererror" -> "partnererror"). */
export function reasonStatus(reason) {
  const m = /^Last (?:publish|run|refresh): (.+)$/i.exec(String(reason || ''))
  return m ? m[1] : ''
}

function warnTitle(area, reason) {
  if (area === 'Engagement data') return 'Engagement data going stale'
  if (/never been published/i.test(reason)) return `${cap(noun(area))} never published`
  if (/never (run|refreshed)/i.test(reason)) return `${cap(noun(area))} that never ran`
  if (/^Overdue/i.test(reason)) return `${cap(noun(area))} overdue`
  return `${cap(noun(area))} needing a look`
}

/**
 * The problems in groups, failed first: `[{ id, area, level, title, note, hint, layout, items }]`.
 * `layout` is 'list' (numbered rows), 'chips' (many names), 'stale' (time since the newest row)
 * or 'inactive'. Expected items are left out.
 */
export function problemGroups(sections, expected = new Set()) {
  const out = new Map()
  const add = (id, base, item) => {
    if (!out.has(id)) out.set(id, { id, ...base, items: [] })
    out.get(id).items.push(item)
  }
  for (const s of sections || []) {
    for (const i of s.items || []) {
      if (expected.has(itemKey(i))) continue
      const item = { ...i, area: s.title }
      if (i.level === 'fail') add(`fail|${s.title}`, { area: s.title, level: 'fail', title: `Failed ${noun(s.title)}` }, item)
      else if (i.level === 'warn') { const t = warnTitle(s.title, i.reason); add(`warn|${t}`, { area: s.title, level: 'warn', title: t }, item) }
      else if (i.level === 'idle') add('idle', { area: '', level: 'idle', title: 'Inactive' }, item)
    }
  }
  const order = { fail: 0, warn: 1, idle: 2 }
  return [...out.values()].map((g) => {
    const names = new Set(g.items.map((i) => i.label))
    const statuses = g.items.map((i) => reasonStatus(i.reason)).join(' ')
    const hint = HINTS.find(([re]) => re.test(statuses))
    let note = ''
    if (g.items.length > 1 && names.size === 1) note = `All ${g.items.length} share one name, so the list shows them numbered.`
    else if (/never published/.test(g.title)) note = 'Mostly drafts and tests. Mark the ones you expect so they stop counting.'
    else if (g.level === 'idle') note = 'Not running on purpose? Mark them as expected to stop counting them.'
    else if (g.title === 'Engagement data going stale') note = 'Time since the newest row. Past the 7-day line needs a look.'
    const layout = g.title === 'Engagement data going stale' ? 'stale' : g.level === 'idle' ? 'inactive' : g.items.length > 12 ? 'chips' : 'list'
    return { ...g, note, hint: hint ? { word: hint[1], text: hint[2] } : null, layout, items: g.items.sort((a, b) => String(b.lastRun || '').localeCompare(String(a.lastRun || ''))) }
  }).sort((a, b) => order[a.level] - order[b.level] || b.items.length - a.items.length)
}

/** One tile per area: `{ title, counts, worst: 'fail' | 'warn' | 'ok' | 'none', label, note }`, expected items as OK. */
export function areaTiles(sections, expected = new Set()) {
  return (sections || []).map((s) => {
    const items = (s.items || []).map((i) => (expected.has(itemKey(i)) ? { ...i, level: 'ok' } : i))
    const counts = countLevels(items)
    const worst = s.error ? 'fail' : !items.length ? 'none' : counts.fail ? 'fail' : counts.warn ? 'warn' : 'ok'
    const label = s.error ? 'Could not load' : !items.length ? 'Nothing to check' : counts.fail ? 'Failed' : counts.warn ? 'Needs a look' : 'All OK'
    const note = s.error ? s.error : s.notice ? s.notice : !items.length ? `No ${noun(s.title)} in this org` : ''
    return { title: s.title, counts, total: items.length, worst, label, note }
  })
}

/** The score: counts over every item (expected as OK) and the share that is OK. */
export function healthScore(sections, expected = new Set()) {
  const items = (sections || []).flatMap((s) => s.items || []).map((i) => (expected.has(itemKey(i)) ? { ...i, level: 'ok' } : i))
  const counts = countLevels(items)
  const total = items.length
  return { counts, total, ok: total ? counts.ok / total : 1, expected: (sections || []).flatMap((s) => s.items || []).filter((i) => expected.has(itemKey(i))).length }
}

/** "3 things failed and 120 need a look", or "Everything is OK". */
export function headline(counts) {
  const parts = []
  if (counts.fail) parts.push(`${counts.fail} ${counts.fail === 1 ? 'thing failed' : 'things failed'}`)
  if (counts.warn) parts.push(`${counts.warn} ${counts.warn === 1 ? 'needs' : 'need'} a look`)
  return parts.length ? parts.join(' and ') : 'Everything is OK'
}

/** "128 data streams, 24 calculated insights, ..." for the OK line. */
export function okBreakdown(sections, expected = new Set()) {
  return (sections || []).map((s) => [s.title, (s.items || []).filter((i) => i.level === 'ok' || expected.has(itemKey(i))).length])
    .filter(([, n]) => n).map(([t, n]) => `${n.toLocaleString()} ${n === 1 ? noun(t).replace(/ies$/, 'y').replace(/s$/, '') : noun(t)}`).join(', ')
}

/** Where an age sits on the 1 hour to 1 year scale of the stale-data rows (0 to 1, log scale). */
export function ageScale(hours) {
  if (!(hours > 1)) return 0
  return Math.min(1, Math.log(hours) / Math.log(24 * 365))
}

/** Changes since the previous check: `{ newProblems: Set<key>, fixed: n }` from `{ key: level }` maps. */
export function healthChanges(before, sections) {
  const newProblems = new Set()
  let fixed = 0
  if (!before) return { newProblems, fixed }
  const bad = (l) => l === 'fail' || l === 'warn'
  const now = {}
  for (const s of sections || []) for (const i of s.items || []) now[itemKey(i)] = i.level
  for (const [k, l] of Object.entries(now)) if (bad(l) && !bad(before[k])) newProblems.add(k)
  for (const [k, l] of Object.entries(before)) if (bad(l) && now[k] && !bad(now[k])) fixed++
  return { newProblems, fixed }
}

/** `{ key: level }` for every item, to compare with the next check. */
export const levelMap = (sections) => Object.fromEntries((sections || []).flatMap((s) => (s.items || []).map((i) => [itemKey(i), i.level])))
