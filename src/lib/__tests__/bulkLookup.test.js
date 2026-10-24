import { parseInputs, phoneKeys, bulkLookup, bulkSummary, bulkCsv } from '../bulkLookup.js'
import { parseRulesets } from '../profile.js'
import { normalizeSegment } from '../segments.js'

const R = parseRulesets([{ rulesetId: 'R', id: '1ir', matchRules: [], reconciliationRules: [{ entityName: 'ssot__Individual__dlm', linkDmoName: 'L__dlm', unifiedDmoName: 'U__dlm' }] }])[0]

describe('bulk lookup', () => {
  it('parses pasted lists, dedupes and classifies', () => {
    expect(parseInputs('a@x.com\nA@X.com, "b@x.com"; +1 (415) 555-0100\tGreg\n003jV00000E4rzVQAR\n\n')).toEqual([
      { input: 'a@x.com', kind: 'email' }, { input: 'b@x.com', kind: 'email' }, { input: '+1 (415) 555-0100', kind: 'phone' },
      { input: 'Greg', kind: 'unknown' }, { input: '003jV00000E4rzVQAR', kind: 'id' },
    ])
  })
  it('tries phones with and without a country code', () => {
    expect(phoneKeys('+1 (415) 555-0100')).toEqual(['14155550100', '4155550100', '155550100', '55550100'])
    expect(phoneKeys('(415) 555-0100')).toEqual(['4155550100'])
  })
  it('finds source records, unified profiles and segment membership in batches', async () => {
    const seen = []
    const q = async (sql) => {
      seen.push(sql)
      const res = (cols, rows) => ({ columns: cols.map((name) => ({ name })), rows })
      if (sql.includes('ContactPointEmail')) return res(['v', 'id'], [['a@x.com', 's1'], ['a@x.com', 's2']])
      if (sql.includes('FROM ssot__Individual__dlm WHERE ssot__Id__c IN')) return res(['id'], [['003jV00000E4rzVQAR']])
      if (sql.includes('WHERE UnifiedRecordId__c IN')) return res(['u', 's'], [])
      if (sql.includes('WHERE SourceRecordId__c IN')) return res(['s', 'u'], [['s1', 'u1'], ['s2', 'u1'], ['003jV00000E4rzVQAR', 'u9']])
      if (sql.includes('FROM SM__dlm')) return res(['id'], [['s1']])
      if (sql.includes('FROM ssot__Individual__dlm s')) return res(['id'], [['s1'], ['003jV00000E4rzVQAR']])
      return res(['x'], [])
    }
    const seg = normalizeSegment({ apiName: 'S', marketSegmentId: '1sgAAAAAAAAAAAAQAC', segmentOnApiName: 'ssot__Individual__dlm', includeCriteria: { type: 'TextComparison', subject: { objectApiName: 'ssot__Individual__dlm', fieldApiName: 'ssot__PersonName__c' }, operator: 'has value' } })
    const items = parseInputs('a@x.com\nnobody@x.com\n003jV00000E4rzVQAR\nGreg')
    const rows = await bulkLookup(q, items, { ruleset: R, segment: seg, catalog: [{ name: 'ssot__Individual__dlm', primaryKeys: ['ssot__Id__c'], fields: [], relationships: [] }], latestTable: 'SM__dlm' })
    expect(rows.map((r) => [r.input, r.sourceIds.join('+'), r.unifiedIds.join('+'), r.member, r.matchesNow, r.note])).toEqual([
      ['a@x.com', 's1+s2', 'u1', true, true, ''],
      ['nobody@x.com', '', '', null, null, 'Not found'],
      ['003jV00000E4rzVQAR', '003jV00000E4rzVQAR', 'u9', false, true, ''],
      ['Greg', '', '', null, null, 'Not an email, phone or ID'],
    ])
    expect(bulkSummary(rows)).toMatchObject({ total: 4, found: 2, notFound: 1, unknown: 1, unified: 2, members: 1 })
    expect(bulkCsv(rows, { segment: seg }).split('\r\n')[1]).toBe('a@x.com,email,yes,s1 s2,u1,yes,yes,')
  })
})

import { detectKind, parseInputs as parse2, kindCounts, lookupTargets, bulkLookup as bulk2 } from '../bulkLookup.js'

describe('what the values are (feedback #120)', () => {
  it('takes short digit runs for IDs, formatted numbers for phones', () => {
    expect(detectKind('10000012')).toBe('id')
    expect(detectKind('+1 415 555 0100')).toBe('phone')
    expect(detectKind('4155550100')).toBe('phone')
    expect(detectKind('jane@example.com')).toBe('email')
    expect(detectKind('Jane Doe')).toBe('unknown')
  })
  it('uses the kind you choose and counts kinds', () => {
    const items = parse2('10000012\n4155550100', { as: 'field' })
    expect(items.map((i) => i.kind)).toEqual(['field', 'field'])
    expect(kindCounts(parse2('a@b.c\n123\n456'))).toEqual({ email: 1, id: 2 })
  })
  it('lists Individual and the objects related to it, with the field that leads back', () => {
    const cat = [
      { name: 'ssot__Individual__dlm', label: 'Individual', fields: [{ name: 'ssot__Id__c', label: 'Id' }], relationships: [] },
      { name: 'Account_Profile__dlm', label: 'Account Profile', fields: [{ name: 'ACCOUNT_ID__c', label: 'Account' }, { name: 'PARTY_ID__c', label: 'Party' }], relationships: [{ from: 'Account_Profile__dlm', fromField: 'PARTY_ID__c', to: 'ssot__Individual__dlm', toField: 'ssot__Id__c' }] },
    ]
    expect(lookupTargets(cat).map((t) => [t.object, t.link])).toEqual([['ssot__Individual__dlm', 'ssot__Id__c'], ['Account_Profile__dlm', 'PARTY_ID__c']])
  })
  it('finds IDs by external record ID and values of a chosen field', async () => {
    const cat = [{ name: 'ssot__Individual__dlm', label: 'Individual', fields: [{ name: 'ssot__Id__c' }, { name: 'ssot__ExternalRecordId__c' }], relationships: [] }]
    const sqls = []
    const q = async (sql) => {
      sqls.push(sql)
      if (sql.includes('FROM ssot__Individual__dlm')) return { columns: [{ name: 'id' }, { name: 'ext' }], rows: [['003A', '10000012']] }
      if (sql.includes('FROM Account_Profile__dlm')) return { columns: [{ name: 'v' }, { name: 'id' }], rows: [['77', '003B']] }
      return { columns: [], rows: [] }
    }
    const rows = await bulk2(q, [...parse2('10000012\n99'), ...parse2('77', { as: 'field' })], { catalog: cat, field: { object: 'Account_Profile__dlm', field: 'ACCOUNT_ID__c', link: 'PARTY_ID__c' } })
    expect(rows.map((r) => [r.input, r.sourceIds, r.note])).toEqual([['10000012', ['003A'], 'External record ID'], ['99', [], 'Not found'], ['77', ['003B'], '']])
    expect(sqls[0]).toContain('OR ssot__ExternalRecordId__c IN')
  })
})
