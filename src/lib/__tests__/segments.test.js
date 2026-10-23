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
      '0:All of these (AND):', '1:Individual.FirstName equals "Ann"', '1:Any of these (OR):', '2:Individual.LastName begins with "L"',
    ])
    expect(describeCriteria({ type: 'Weird' })[0].raw).toContain('Weird')
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
