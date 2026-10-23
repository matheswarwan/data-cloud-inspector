import { emptyModel, joinOptions, addJoin, removeJoin, buildSql, countSql, filterSql } from '../queryBuilder.js'

const CATALOG = [
  { name: 'ssot__Individual__dlm', label: 'Individual', category: 'Profile', fields: [{ name: 'ssot__Id__c' }, { name: 'ssot__FirstName__c' }, { name: 'ssot__Age__c', businessType: 'NUMBER' }], relationships: [
    { from: 'ssot__ContactPointEmail__dlm', to: 'ssot__Individual__dlm', fromField: 'ssot__PartyId__c', toField: 'ssot__Id__c' },
  ] },
  { name: 'ssot__ContactPointEmail__dlm', label: 'Contact Point Email', category: 'Related', fields: [{ name: 'ssot__Id__c' }, { name: 'ssot__EmailAddress__c' }], relationships: [
    { from: 'ssot__ContactPointEmail__dlm', to: 'ssot__Individual__dlm', fromField: 'ssot__PartyId__c', toField: 'ssot__Id__c' },
  ] },
]

describe('query builder', () => {
  it('offers joins from the relationships with the keys', () => {
    expect(joinOptions('ssot__Individual__dlm', CATALOG)).toEqual([{ object: 'ssot__ContactPointEmail__dlm', objectField: 'ssot__Id__c', otherField: 'ssot__PartyId__c', category: 'Related', label: 'Contact Point Email' }])
  })
  it('builds a join with fields, filters, sort and limit, and keeps column names unique', () => {
    const m = emptyModel('ssot__Individual__dlm')
    m.fields = ['ssot__Id__c', 'ssot__FirstName__c']
    const a = addJoin(m, 't0', joinOptions('ssot__Individual__dlm', CATALOG)[0])
    m.joins[0].fields = ['ssot__EmailAddress__c', 'ssot__Id__c']
    m.joins[0].type = 'INNER'
    m.filters = [
      { alias: 't0', field: 'ssot__Age__c', op: 'ge', value: '18' },
      { alias: a, field: 'ssot__EmailAddress__c', op: 'contains', value: "o'brien" },
      { alias: 't0', field: 'ssot__FirstName__c', op: 'eq', value: '' }, // incomplete: left out
    ]
    m.orderBy = [{ alias: 't0', field: 'ssot__FirstName__c', dir: 'DESC' }]
    expect(buildSql(m, CATALOG)).toBe([
      'SELECT',
      '  t0.ssot__Id__c,\n  t0.ssot__FirstName__c,\n  t1.ssot__EmailAddress__c,\n  t1.ssot__Id__c AS t1_ssot__Id__c',
      'FROM ssot__Individual__dlm t0',
      'JOIN ssot__ContactPointEmail__dlm t1 ON t1.ssot__PartyId__c = t0.ssot__Id__c',
      "WHERE t0.ssot__Age__c >= 18\n  AND t1.ssot__EmailAddress__c ILIKE '%o''brien%'",
      'ORDER BY t0.ssot__FirstName__c DESC',
      'LIMIT 100',
    ].join('\n'))
    expect(countSql(m, CATALOG)).toMatch(/^SELECT COUNT\(\*\) AS n FROM \(\nSELECT\n[\s\S]*\n\) q$/)
    expect(countSql(m, CATALOG)).not.toContain('LIMIT')
    expect(countSql(m, CATALOG)).not.toContain('ORDER BY')
  })
  it('selects everything when no field is ticked, and handles DISTINCT and left joins', () => {
    const m = emptyModel('ssot__Individual__dlm')
    m.distinct = true
    addJoin(m, 't0', joinOptions('ssot__Individual__dlm', CATALOG)[0])
    expect(buildSql(m, CATALOG)).toContain('SELECT DISTINCT\n  t0.*')
    expect(buildSql(m, CATALOG)).toContain('LEFT JOIN ssot__ContactPointEmail__dlm t1')
  })
  it('removes a join with what hangs under it', () => {
    const m = emptyModel('ssot__Individual__dlm')
    const a = addJoin(m, 't0', { object: 'X', objectField: 'k', otherField: 'k' })
    addJoin(m, a, { object: 'Y', objectField: 'k', otherField: 'k' })
    m.filters = [{ alias: 't2', field: 'f', op: 'eq', value: '1' }]
    removeJoin(m, a)
    expect(m.joins).toEqual([])
    expect(m.filters).toEqual([])
  })
  it('writes each operator', () => {
    const m = emptyModel('ssot__Individual__dlm')
    const f = (op, value) => filterSql(m, CATALOG, { alias: 't0', field: 'ssot__Age__c', op, value })
    expect(f('in', '1, 2,3')).toBe('t0.ssot__Age__c IN (1, 2, 3)')
    expect(f('empty')).toBe("(t0.ssot__Age__c IS NULL OR CAST(t0.ssot__Age__c AS VARCHAR) = '')")
    expect(filterSql(m, CATALOG, { alias: 't0', field: 'ssot__FirstName__c', op: 'eq', value: '18' })).toBe("t0.ssot__FirstName__c = '18'")
  })
})
