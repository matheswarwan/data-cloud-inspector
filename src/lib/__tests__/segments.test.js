import { withSizes, decodeHtml, parseCriteria, normalizeSegment, describeCriteria, criteriaSql, segmentSql, topConditions, membershipTables, publishHistory, checkMembers } from '../segments.js'

const LIVE = '{&quot;type&quot;:&quot;TextComparison&quot;,&quot;subject&quot;:{&quot;objectApiName&quot;:&quot;ssot__Individual__dlm&quot;,&quot;fieldApiName&quot;:&quot;ssot__PersonName__c&quot;},&quot;operator&quot;:&quot;has value&quot;,&quot;subjectFieldDataType&quot;:&quot;TEXT&quot;}'
const ON = 'ssot__Individual__dlm'
const CATALOG = [
  { name: ON, category: 'Profile', primaryKeys: ['ssot__Id__c'], fields: [], relationships: [] },
  { name: 'ssot__ContactPointEmail__dlm', category: 'Related', primaryKeys: ['ssot__Id__c'], fields: [], relationships: [
    { from: 'ssot__ContactPointEmail__dlm', to: ON, fromField: 'ssot__PartyId__c', toField: 'ssot__Id__c' },
  ] },
  { name: 'Individual_SM_1__dlm', label: 'Individual - Latest', category: 'Segment_Membership', fields: [], relationships: [{ from: 'Individual_SM_1__dlm', to: ON, fromField: 'Id__c', toField: 'ssot__Id__c' }] },
  { name: 'Individual_SMH_2__dlm', label: 'Individual - History', category: 'Segment_Membership', fields: [], relationships: [{ from: 'Individual_SMH_2__dlm', to: ON, fromField: 'Id__c', toField: 'ssot__Id__c' }] },
]
const rule = (field, operator, extra = {}, obj = ON) => ({ type: 'TextComparison', subject: { objectApiName: obj, fieldApiName: field }, operator, ...extra })

describe('criteria', () => {
  it('reads the HTML-escaped criteria the API returns', () => {
    expect(decodeHtml('a &amp; &quot;b&quot;')).toBe('a & "b"')
    const c = parseCriteria(LIVE)
    expect(c.operator).toBe('has value')
    expect(parseCriteria('{bad')).toEqual({ unparsed: '{bad' })
    expect(parseCriteria(null)).toBeNull()
  })
  it('describes groups and rules', () => {
    const c = { type: 'LogicalComparison', operator: 'and', filters: [rule('ssot__FirstName__c', 'equals', { value: 'Ann' }), { operator: 'or', filters: [rule('ssot__LastName__c', 'begins with', { value: 'L' })] }] }
    expect(describeCriteria(c).map((l) => `${l.depth}:${l.text}`)).toEqual([
      '0:All of these (AND):', '1:Individual.FirstName is "Ann"', '1:Any of these (OR):', '2:Individual.LastName begins with "L"',
    ])
    expect(describeCriteria({ type: 'Weird' })[0].raw).toContain('Weird')
  })
  it('describes count rules on related records and relative dates (feedback #1003)', () => {
    const sub = (o, f) => ({ objectApiName: o, fieldApiName: f })
    const agg = {
      filter: { type: 'LogicalComparison', operator: 'and', filters: [
        { type: 'TextComparison', subject: sub('Services__dlm', 'STATUS_ID__c'), operator: 'in', values: ['1', '3'] },
        { type: 'RelativeToNowDateComparison', subject: sub('Services__dlm', 'CLOSE_DT__c'), operator: 'in the last number of days', value: 16 },
      ] },
      containerObjectApiName: 'Services__dlm',
      path: [[sub('ssot__Individual__dlm', 'ssot__Id__c'), sub('Services__dlm', 'PARTY_ID__c')]],
      type: 'NumberAggregation', aggregateFunction: 'count',
      comparison: { type: 'NumberComparison', subject: sub('Services__dlm', 'SERVICE_ID__c'), operator: 'greater than or equal', value: 1 },
    }
    const c = { type: 'LogicalComparison', operator: 'or', filters: [agg, { filter: { type: 'TextComparison', subject: sub('ssot__Individual__dlm', 'ssot__PrimaryLanguageId__c'), operator: 'equal', values: ['E'] } }] }
    expect(describeCriteria(c).map((l) => `${l.depth}:${l.text}`)).toEqual([
      '0:Any of these (OR):',
      '1:At least 1 related Services record where:',
      '2:All of these (AND):',
      '3:Services.STATUS_ID is one of "1", "3"',
      '3:Services.CLOSE_DT is in the last 16 days',
      '1:Individual.PrimaryLanguageId is "E"',
    ])
    expect(criteriaSql(agg, 'ssot__Individual__dlm', []).error).toMatch(/count rules/)
    expect(criteriaSql({ type: 'TextComparison', subject: sub('ssot__Individual__dlm', 'X__c'), operator: 'equal', values: ['E'] }, 'ssot__Individual__dlm', []).sql).toBe(`LOWER(s.X__c) = LOWER('E')`)
  })
  it('translates operators to SQL', () => {
    expect(criteriaSql(parseCriteria(LIVE), ON, CATALOG).sql).toBe("(s.ssot__PersonName__c IS NOT NULL AND CAST(s.ssot__PersonName__c AS VARCHAR) <> '')")
    expect(criteriaSql(rule('ssot__FirstName__c', 'equals', { value: "O'Neil" }), ON, CATALOG).sql).toBe("LOWER(s.ssot__FirstName__c) = LOWER('O''Neil')")
    expect(criteriaSql(rule('ssot__FirstName__c', 'contains', { value: 'nn' }), ON, CATALOG).sql).toBe("s.ssot__FirstName__c ILIKE '%nn%'")
    expect(criteriaSql({ ...rule('ssot__Age__c', 'between', { values: [18, 30] }), type: 'NumericComparison' }, ON, CATALOG).sql).toBe("s.ssot__Age__c BETWEEN '18' AND '30'")
    const or = criteriaSql({ operator: 'or', filters: [rule('a', 'is null'), rule('b', 'is null')] }, ON, CATALOG)
    expect(or.sql).toBe('(s.a IS NULL OR s.b IS NULL)')
  })
  it('uses EXISTS for a rule on a related object', () => {
    const r = criteriaSql(rule('ssot__EmailAddress__c', 'ends with', { value: '@x.com' }, 'ssot__ContactPointEmail__dlm'), ON, CATALOG)
    expect(r.sql).toBe("EXISTS (SELECT 1 FROM ssot__ContactPointEmail__dlm r WHERE r.ssot__PartyId__c = s.ssot__Id__c AND r.ssot__EmailAddress__c ILIKE '%@x.com')")
  })
  it('says why it cannot translate, instead of guessing', () => {
    expect(criteriaSql(rule('x', 'last 30 days'), ON, CATALOG).error).toMatch(/not supported/)
    expect(criteriaSql(rule('x', 'equals'), ON, CATALOG).error).toMatch(/without a value/)
    expect(criteriaSql(rule('x', 'equals', { value: 1, path: ['a'] }), ON, CATALOG).error).toMatch(/relationship path/)
    expect(criteriaSql(rule('x', 'equals', { value: 1 }, 'Other__dlm'), ON, CATALOG).error).toMatch(/no direct relationship/)
  })
  it('splits the top-level AND for the rule-by-rule check', () => {
    expect(topConditions({ operator: 'and', filters: [1, 2] })).toEqual([1, 2])
    expect(topConditions({ operator: 'or', filters: [1, 2] })).toHaveLength(1)
  })
})

describe('segment', () => {
  const seg = normalizeSegment({ apiName: 'S', displayName: 'S 1', marketSegmentId: '1sgjV000000Cmk1QAC', segmentOnApiName: ON, segmentMembershipTable: 'Individual_SMH_2__dlm', includeCriteria: LIVE, lastSegmentMemberCount: 150 })
  it('normalizes and builds SQL', () => {
    expect(seg).toMatchObject({ id15: '1sgjV000000Cmk1', on: ON, lastCount: 150 })
    expect(segmentSql(seg, CATALOG).count).toMatch(/^SELECT COUNT\(\*\) AS members FROM ssot__Individual__dlm s WHERE /)
    expect(membershipTables(seg, CATALOG)).toEqual({ latest: 'Individual_SM_1__dlm', history: 'Individual_SMH_2__dlm' })
  })
  it('groups publish history by version', async () => {
    const q = async () => ({ columns: ['version', 'at', 'delta', 'n'].map((name) => ({ name })), rows: [['v2', '2026-10-23', 'new', 3], ['v2', '2026-10-23', 'deleted', 1], ['v1', '2026-10-22', 'new', 150]] })
    expect(await publishHistory(q, 'Individual_SMH_2__dlm', seg)).toEqual([
      { version: 'v2', at: '2026-10-23', members: 4, deltas: { new: 3, deleted: 1 }, snapshot: '', size: 152 },
      { version: 'v1', at: '2026-10-22', members: 150, deltas: { new: 150 }, snapshot: '', size: 150 },
    ])
  })
  it('works out the size of each publish', () => {
    const v = withSizes([
      { version: '3', snapshot: 'F', members: 120, deltas: { new: 120 } },
      { version: '2', snapshot: 'I', members: 15, deltas: { new: 10, deleted: 5 } },
      { version: '1', snapshot: 'F', members: 100, deltas: { new: 100 } },
    ])
    expect(v.map((x) => [x.version, x.size])).toEqual([['3', 120], ['2', 105], ['1', 100]])
  })

  it('checks members and which condition fails', async () => {
    const two = normalizeSegment({ ...seg.raw, includeCriteria: { operator: 'and', filters: [rule('ssot__FirstName__c', 'equals', { value: 'Ann' }), rule('ssot__LastName__c', 'equals', { value: 'Lee' })] } })
    const q = async (sql) => {
      const out = (ids) => ({ columns: [{ name: 'id' }, { name: 'at' }], rows: ids.map((i) => [i, 't']) })
      if (sql.includes('FROM Individual_SM_1__dlm')) return out(['a'])
      if (sql.includes("'Ann'") && sql.includes("'Lee'")) return out(['b'])
      if (sql.includes("'Ann'")) return out(['b', 'c'])
      return out(['a', 'b'])
    }
    const r = await checkMembers(q, two, CATALOG, ['a', 'b', 'c'], 'Individual_SM_1__dlm')
    expect(r.map((x) => [x.id, x.member, x.matchesNow, x.failing])).toEqual([
      ['a', true, false, [0]], ['b', false, true, []], ['c', false, false, [1]],
    ])
  })
})

import { loadSegments as load2, sortSegments } from '../segments.js'

describe('every segment and sorting (feedback #121)', () => {
  const seg = (i) => ({ apiName: `S${i}`, displayName: `Segment ${String(i).padStart(3, '0')}`, createdDate: `2026-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`, lastSegmentMemberCount: i })
  it('reads pages of 20 when 100 were asked for, until the total', async () => {
    const all = Array.from({ length: 53 }, (_, i) => seg(i))
    const offsets = []
    const call = async (path) => {
      const offset = Number(new URL(`https://x${path}`).searchParams.get('offset'))
      offsets.push(offset)
      return { ok: true, data: { segments: all.slice(offset, offset + 20), totalSize: 53 } }
    }
    const list = await load2(call, '68.0')
    expect(list).toHaveLength(53)
    expect(offsets).toEqual([0, 20, 40])
  })
  it('stops when the API ignores the offset', async () => {
    const call = async () => ({ ok: true, data: { segments: [seg(1), seg(2)] } })
    expect(await load2(call, '68.0')).toHaveLength(2)
  })
  it('sorts by created, members, name', () => {
    const list = [{ label: 'B', created: '2026-01-02', lastCount: 5 }, { label: 'A', created: '2026-03-01', lastCount: 1 }, { label: 'C', created: '', lastCount: null }]
    expect(sortSegments(list, 'created').map((x) => x.label)).toEqual(['A', 'B', 'C'])
    expect(sortSegments(list, 'members').map((x) => x.label)).toEqual(['B', 'A', 'C'])
    expect(sortSegments(list, 'name').map((x) => x.label)).toEqual(['A', 'B', 'C'])
  })
})

describe('segments shown while loading (feedback #1005)', () => {
  it('reports each page with the total', async () => {
    const all = Array.from({ length: 250 }, (_, i) => ({ apiName: `S${String(i).padStart(3, '0')}`, displayName: `Seg ${i}` }))
    const call = async (path) => {
      const offset = Number(new URL(`https://x${path}`).searchParams.get('offset'))
      return { ok: true, data: { segments: all.slice(offset, offset + 100), totalSize: all.length } }
    }
    const pages = []
    const out = await load2(call, '64.0', { onPage: (items, total) => pages.push([items.length, total]) })
    expect(pages).toEqual([[100, 250], [200, 250], [250, 250]])
    expect(out).toHaveLength(250)
  })
})

describe('personHistory (feedback #1028)', async () => {
  const { personHistory, segIdIn } = await import('../segments.js')
  it('keeps the newest row per person and segment and counts the rest', async () => {
    const q = async () => ({ columns: ['id', 'seg', 'parent', 'delta', 'snapshot', 'at', 'version'].map((name) => ({ name })), rows: [
      ['p1', '1sgAAA000000001XYZ', '', 'Added', 'Incremental', '2026-10-02', 'v2'],
      ['p1', '1sgAAA000000001', '', 'Added', 'Full', '2026-10-01', 'v1'],
      ['p1', '1sgAAA000000002', '1sgAAA000000001', 'Removed', 'Full', '2026-09-01', 'v0'],
    ] })
    const m = await personHistory(q, 'Individual_SMH_1__dlm', ['p1', 'p2'])
    expect(m.get('p2')).toEqual([])
    const [a, b] = m.get('p1')
    expect(a).toMatchObject({ segmentId: '1sgAAA000000001', publishes: 2, version: 'v2', leaving: false })
    expect(b).toMatchObject({ segmentId: '1sgAAA000000002', parentId: '1sgAAA000000001', leaving: true })
  })
  it('matches 15 and 18 character segment IDs', () => {
    expect(segIdIn({ id15: '1sgAAA000000001', id: '1sgAAA000000001XYZ' })).toBe("IN ('1sgAAA000000001', '1sgAAA000000001XYZ')")
  })
})

describe('loadMembers (feedback #1031)', async () => {
  const { loadMembers, membersSql } = await import('../segments.js')
  const seg = { id15: '1sgAAA000000001', id: '1sgAAA000000001XYZ', on: 'ssot__Individual__dlm' }
  const catalog = [{ name: 'ssot__Individual__dlm', primaryKeys: ['ssot__Id__c'], fields: [{ name: 'ssot__Id__c' }, { name: 'ssot__FirstName__c' }, { name: 'ssot__LastName__c' }] }]
  it('pages by ID', () => {
    expect(membersSql(seg, 'Individual_SM_1__dlm', { limit: 100, offset: 200 })).toBe("SELECT Id__c AS id, Timestamp__c AS since FROM Individual_SM_1__dlm WHERE Segment_Id__c IN ('1sgAAA000000001', '1sgAAA000000001XYZ') ORDER BY Id__c LIMIT 100 OFFSET 200")
  })
  it('adds names from the segment object for just the page', async () => {
    const seen = []
    const q = async (sql) => {
      seen.push(sql)
      return /Individual_SM_1/.test(sql)
        ? { columns: [{ name: 'id' }, { name: 'since' }], rows: [['p1', 't1'], ['p2', 't2']] }
        : { columns: [{ name: 'id' }, { name: 'first' }, { name: 'last' }], rows: [['p1', 'Olivia', 'Makileni']] }
    }
    expect(await loadMembers(q, seg, catalog, 'Individual_SM_1__dlm')).toEqual([{ id: 'p1', since: 't1', name: 'Olivia Makileni' }, { id: 'p2', since: 't2', name: '' }])
    expect(seen[1]).toBe("SELECT ssot__Id__c AS id, ssot__FirstName__c AS first, ssot__LastName__c AS last FROM ssot__Individual__dlm WHERE ssot__Id__c IN ('p1', 'p2')")
  })
})
