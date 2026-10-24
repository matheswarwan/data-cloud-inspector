import { describeCriterion, describeReconciliation, loadRulesetDetail, comparePeople, compareMany, IDENTITY_SQL } from '../identity.js'
import { parseRulesets } from '../profile.js'

const R = parseRulesets([{
  rulesetId: 'R001', id: '1irX', label: 'Test', rulesetStatus: 'PUBLISHED', doesRunAutomatically: true,
  matchRules: [{ label: 'Name and email', criteria: [
    { entityName: 'ssot__Individual__dlm', fieldName: 'ssot__FirstName__c', matchMethodType: 'fuzzy' },
    { entityName: 'ssot__Individual__dlm', fieldName: 'ssot__LastName__c', matchMethodType: 'exact' },
    { entityName: 'ssot__ContactPointEmail__dlm', fieldName: 'ssot__EmailAddress__c', matchMethodType: 'exactnormalized' },
  ] }],
  reconciliationRules: [
    { entityName: 'ssot__Individual__dlm', ruleType: 'lastupdated', shouldIgnoreEmptyValue: true, linkDmoName: 'L__dlm', unifiedDmoName: 'U__dlm', fields: [], sources: [] },
    { entityName: 'ssot__ContactPointPhone__dlm', ruleType: 'sourcepriority', sources: [{ name: 'CRM' }, 'Web'], fields: [{ fieldName: 'ssot__TelephoneNumber__c', ruleType: 'mostfrequent' }] },
  ],
}])[0]

describe('identity resolution', () => {
  it('describes criteria and reconciliation in plain words', () => {
    expect(describeCriterion(R.rules[0].criteria[0])).toBe('Individual.FirstName is similar (fuzzy)')
    expect(describeReconciliation(R.reconciliation[0])).toEqual(['Individual: keep the most recently updated value, ignoring empty values'])
    expect(describeReconciliation(R.reconciliation[1])).toEqual([
      'ContactPointPhone: keep the value from the highest-priority source, ignoring empty values',
      'Source order: CRM > Web',
      'ssot__TelephoneNumber__c: most frequent value',
    ])
    expect(R).toMatchObject({ runsAutomatically: true, link: 'L__dlm' })
  })
  it('loads stats and the profile size queries', async () => {
    const call = async () => ({ ok: true, data: { sourceProfiles: 200, totalUnifiedProfiles: 150, consolidationRate: 0.25, lastJobStatus: 'SUCCESS' } })
    const q = async (sql) => {
      if (sql === IDENTITY_SQL.sizes('L__dlm')) return { columns: [{ name: 'sources' }, { name: 'profiles' }], rows: [[1, 110], [2, 40]] }
      if (sql === IDENTITY_SQL.largest('L__dlm')) return { columns: [{ name: 'unified' }, { name: 'sources' }], rows: [['u1', 2]] }
      return { columns: [{ name: 'source' }, { name: 'object' }, { name: 'n' }], rows: [['Salesforce_Home', 'Contact', 200]] }
    }
    const d = await loadRulesetDetail(call, q, '68.0', R)
    expect(d.stats).toMatchObject({ sourceProfiles: 200, unifiedProfiles: 150, consolidationRate: 25 })
    expect(d.sizes).toEqual([{ sources: 1, profiles: 110 }, { sources: 2, profiles: 40 }])
    expect(d.largest).toEqual([{ unified: 'u1', sources: 2 }])
    expect(d.sources[0]).toEqual({ source: 'Salesforce_Home', object: 'Contact', n: 200 })
  })
  it('compares two people criterion by criterion', async () => {
    const tables = {
      ssot__Individual__dlm: [{ ssot__Id__c: 'a', ssot__FirstName__c: 'Jon', ssot__LastName__c: 'Smith' }, { ssot__Id__c: 'b', ssot__FirstName__c: 'Jonathan', ssot__LastName__c: 'Smith' }],
      ssot__ContactPointEmail__dlm: [{ ssot__PartyId__c: 'a', ssot__EmailAddress__c: 'J@x.com' }, { ssot__PartyId__c: 'b', ssot__EmailAddress__c: 'j@x.com' }],
      L__dlm: [{ s: 'a', u: 'u1' }, { s: 'b', u: 'u2' }],
    }
    const q = async (sql) => {
      const t = Object.keys(tables).find((k) => sql.includes(`FROM ${k}`))
      const rows = tables[t]
      const cols = Object.keys(rows[0]).map((name) => ({ name }))
      return { columns: cols, rows: rows.map((r) => cols.map((c) => r[c.name])) }
    }
    const catalog = [{ name: 'ssot__ContactPointEmail__dlm', category: 'Related', fields: [], relationships: [{ from: 'ssot__ContactPointEmail__dlm', to: 'ssot__Individual__dlm', fromField: 'ssot__PartyId__c', toField: 'ssot__Id__c' }] }, { name: 'ssot__Individual__dlm', fields: [], relationships: [] }]
    const c = await comparePeople(q, R, catalog, 'a', 'b')
    // Jon and Jonathan score 0.854, just above the 0.85 fuzzy threshold; the email differs only in case.
    expect(c.rules[0].rows.map((r) => r.matches)).toEqual([true, true, true])
    expect(c.anyRuleMatches).toBe(true)
    expect(c.sameProfile).toEqual({ same: false, a: 'u1', b: 'u2' }) // would match, yet separate profiles
    tables.ssot__Individual__dlm[1].ssot__FirstName__c = 'Bob'
    const d = await comparePeople(q, R, catalog, 'a', 'b')
    expect(d.rules[0].rows.map((r) => r.matches)).toEqual([false, true, true])
    expect(d.anyRuleMatches).toBe(false)
  })
  it('compares many people: pairs, chains of matches and the profiles they are in', async () => {
    const tables = {
      ssot__Individual__dlm: [
        { ssot__Id__c: 'a', ssot__FirstName__c: 'Jon', ssot__LastName__c: 'Smith' },
        { ssot__Id__c: 'b', ssot__FirstName__c: 'Jon', ssot__LastName__c: 'Smith' },
        { ssot__Id__c: 'c', ssot__FirstName__c: 'Jon', ssot__LastName__c: 'Smith' },
        { ssot__Id__c: 'd', ssot__FirstName__c: 'Ann', ssot__LastName__c: 'Lee' },
      ],
      ssot__ContactPointEmail__dlm: [
        { ssot__PartyId__c: 'a', ssot__EmailAddress__c: 'j@x.com' }, { ssot__PartyId__c: 'b', ssot__EmailAddress__c: 'J@X.com' },
        { ssot__PartyId__c: 'c', ssot__EmailAddress__c: 'other@x.com' }, { ssot__PartyId__c: 'd', ssot__EmailAddress__c: 'ann@x.com' },
      ],
      L__dlm: [{ s: 'a', u: 'u1' }, { s: 'b', u: 'u1' }, { s: 'c', u: 'u2' }, { s: 'd', u: 'u3' }],
    }
    const q = async (sql) => {
      const t = Object.keys(tables).find((k) => sql.includes(`FROM ${k}`))
      const cols = Object.keys(tables[t][0]).map((name) => ({ name }))
      return { columns: cols, rows: tables[t].map((r) => cols.map((c) => r[c.name])) }
    }
    const catalog = [{ name: 'ssot__ContactPointEmail__dlm', category: 'Related', fields: [], relationships: [{ from: 'ssot__ContactPointEmail__dlm', to: 'ssot__Individual__dlm', fromField: 'ssot__PartyId__c', toField: 'ssot__Id__c' }] }, { name: 'ssot__Individual__dlm', fields: [], relationships: [] }]
    const m = await compareMany(q, R, catalog, ['a', 'b', 'c', 'd'])
    expect(m.pairs).toHaveLength(6)
    expect(m.pairs.filter((p) => p.rules.length).map((p) => [p.a, p.b])).toEqual([[0, 1]])
    expect(m.pairs[0]).toMatchObject({ rules: ['Name and email'], sameProfile: true })
    expect(m.ruleGroups).toEqual([[0, 1], [2], [3]])
    expect(m.profileGroups).toEqual([[0, 1], [2], [3]])
    expect(m.agrees).toBe(true)
    // the email column: a and b match each other; c and d match nobody
    expect(m.rules[0].rows[2].matchesSomeone).toEqual([true, true, false, false])
    tables.L__dlm[2].u = 'u1' // c is unified with a and b although no rule joins it
    const m2 = await compareMany(q, R, catalog, ['a', 'b', 'c', 'd'])
    expect(m2.agrees).toBe(false)
    await expect(compareMany(q, R, catalog, ['a'])).rejects.toThrow('at least two')
  })
})
