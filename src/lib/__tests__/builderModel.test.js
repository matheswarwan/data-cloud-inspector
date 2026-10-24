import { describe, it, expect } from 'vitest'
import { emptyQuery, addTable, removeTable, moveTable, buildQuery, countQuery, filterSql, onClause, problems, fieldOptions, suggestConditions } from '../builderModel.js'

const f = (name, type = 'TEXT') => ({ name, label: name, type, businessType: type })
const IND = { name: 'ssot__Individual__dlm', label: 'Individual', kind: 'DMO', category: 'Profile', primaryKeys: ['ssot__Id__c'], fields: [f('ssot__Id__c'), f('ssot__FirstName__c'), f('ssot__BirthDate__c', 'DATE')], relationships: [] }
const EMAIL = { name: 'ssot__ContactPointEmail__dlm', label: 'Email', kind: 'DMO', category: 'Related', primaryKeys: ['ssot__Id__c'], fields: [f('ssot__Id__c'), f('ssot__PartyId__c'), f('ssot__EmailAddress__c')], relationships: [{ from: 'ssot__ContactPointEmail__dlm', fromField: 'ssot__PartyId__c', to: 'ssot__Individual__dlm', toField: 'ssot__Id__c', cardinality: 'NTOONE' }] }
const DLO = { name: 'Orders__dll', label: 'Orders', kind: 'DLO', category: '', primaryKeys: ['Id__c'], fields: [f('Id__c'), f('Amount__c', 'NUMBER'), f('ssot__FirstName__c')], relationships: [] }
const CAT = [IND, EMAIL, DLO]

describe('query builder model (feedback #110)', () => {
  it('builds one table with every field and a limit', () => {
    const q = emptyQuery()
    addTable(q, IND.name, CAT)
    expect(buildQuery(q, CAT)).toBe('SELECT\n  t1.ssot__Id__c,\n  t1.ssot__FirstName__c,\n  t1.ssot__BirthDate__c\nFROM ssot__Individual__dlm t1\nLIMIT 100')
  })
  it('suggests the join from the metadata and aliases duplicate columns', () => {
    const q = emptyQuery()
    addTable(q, IND.name, CAT)
    const e = addTable(q, EMAIL.name, CAT)
    expect(q.joins[0]).toMatchObject({ tableId: e, type: 'LEFT JOIN', conditions: [{ left: 'ssot__Id__c', op: '=', right: 'ssot__PartyId__c' }] })
    q.tables[0].fields = ['ssot__Id__c']
    q.tables[1].fields = ['ssot__Id__c', 'ssot__EmailAddress__c']
    const sql = buildQuery(q, CAT)
    expect(sql).toContain('  t1.ssot__Id__c AS t1_ssot__Id__c,\n  t2.ssot__Id__c AS t2_ssot__Id__c,\n  t2.ssot__EmailAddress__c')
    expect(sql).toContain('LEFT JOIN ssot__ContactPointEmail__dlm t2 ON t1.ssot__Id__c = t2.ssot__PartyId__c')
    expect(problems(q)).toEqual([])
  })
  it('joins on several conditions with AND or OR, and flags incomplete joins', () => {
    const j = { combinator: 'OR', conditions: [{ left: 'a', op: '=', right: 'b' }, { left: 'c', op: '<>', right: 'd' }, { left: '', right: 'x' }] }
    expect(onClause(j, 't1', 't2')).toBe('t1.a = t2.b\n    OR t1.c <> t2.d')
    const q = emptyQuery()
    addTable(q, IND.name, CAT)
    addTable(q, 'Nothing__dll', CAT) // unknown object: nothing to suggest
    expect(problems(q)).toHaveLength(1)
    expect(buildQuery(q, CAT)).toContain('ON /* set the join condition */ TRUE')
  })
  it('suggests a shared field when the metadata relates nothing', () => {
    expect(suggestConditions(IND, DLO, CAT)).toEqual([{ left: 'ssot__FirstName__c', op: '=', right: 'ssot__FirstName__c' }])
  })
  it('writes filters by field type', () => {
    expect(filterSql({ alias: 't1', field: 'Amount__c', op: '>', value: '10' }, 'NUMBER')).toBe('t1.Amount__c > 10')
    expect(filterSql({ alias: 't1', field: 'Name__c', op: 'contains', value: "O'B" }, 'TEXT')).toBe("t1.Name__c ILIKE '%O''B%'")
    expect(filterSql({ alias: 't1', field: 'X', op: 'in', value: 'a, b' })).toBe("t1.X IN ('a', 'b')")
    expect(filterSql({ alias: 't1', field: 'X', op: 'empty' })).toBe("(t1.X IS NULL OR t1.X = '')")
    expect(filterSql({ alias: 't1', field: 'D', op: 'notEmpty' }, 'DATE')).toBe('(t1.D IS NOT NULL)')
    expect(filterSql({ alias: 't1', field: 'D', op: 'lastDays', value: '30' }, 'DATE')).toBe("t1.D >= CURRENT_DATE - INTERVAL '30 days'")
    expect(filterSql({ alias: 't1', field: 'X', op: '=', value: '' })).toBe('')
  })
  it('adds where, group by with computed columns, order by, distinct; counts without the limit', () => {
    const q = emptyQuery()
    addTable(q, DLO.name, CAT)
    q.where.conditions.push({ alias: 't1', field: 'Amount__c', op: '>', value: '5' })
    q.options.groupBy.push({ alias: 't1', field: 'ssot__FirstName__c' })
    q.options.computed.push({ expression: 'SUM(t1.Amount__c)', alias: 'total' })
    q.options.orderBy.push({ alias: 't1', field: 'ssot__FirstName__c', dir: 'DESC' })
    q.options.distinct = true
    expect(buildQuery(q, CAT)).toBe('SELECT DISTINCT\n  t1.ssot__FirstName__c,\n  SUM(t1.Amount__c) AS total\nFROM Orders__dll t1\nWHERE t1.Amount__c > 5\nGROUP BY t1.ssot__FirstName__c\nORDER BY t1.ssot__FirstName__c DESC\nLIMIT 100')
    expect(countQuery(q, CAT)).toMatch(/^SELECT COUNT\(\*\) AS row_count FROM \(\nSELECT DISTINCT[\s\S]*DESC\n\) x$/)
  })
  it('removes and moves tables, keeping filters on the same table', () => {
    const q = emptyQuery()
    const a = addTable(q, IND.name, CAT)
    const b = addTable(q, EMAIL.name, CAT)
    const c = addTable(q, DLO.name, CAT)
    q.where.conditions.push({ alias: 't3', field: 'Amount__c', op: '>', value: '1' }, { alias: 't2', field: 'ssot__EmailAddress__c', op: 'notEmpty' })
    expect(moveTable(q, b, -1)).toBe(false) // the first table cannot have a join
    q.joins.find((j) => j.tableId === c).leftId = a
    expect(moveTable(q, c, -1)).toBe(true) // c joins a, so it can move above b
    expect(q.tables.map((t) => t.id)).toEqual([a, c, b])
    expect(q.where.conditions.map((x) => x.alias)).toEqual(['t2', 't3'])
    removeTable(q, c)
    expect(q.tables.map((t) => t.id)).toEqual([a, b])
    expect(q.where.conditions.map((x) => x.alias)).toEqual(['t2'])
    expect(fieldOptions(q, CAT).filter((o) => o.alias === 't2').map((o) => o.field)).toEqual(['ssot__Id__c', 'ssot__PartyId__c', 'ssot__EmailAddress__c'])
    removeTable(q, a)
    expect(q.joins).toEqual([])
  })
})
