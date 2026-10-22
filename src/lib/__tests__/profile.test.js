import {
  lit, inList, toObjects, parseRulesets, searchKind, searchSql, search, relatedTo, eventTimeField,
  loadProfile, loadRelated, normalize, similarity, criterionMatches, explainMatches, possibleMissedMatches, profileMarkdown,
} from '../profile.js'

const RULESET = {
  rulesetId: 'R001', label: 'Test Rule 1', configurationType: 'individual', rulesetStatus: 'PUBLISHED', lastJobStatus: 'SUCCESS',
  matchRules: [{ label: 'Fuzzy Name and Normalized Email', criteria: [
    { entityName: 'ssot__Individual__dlm', fieldName: 'ssot__FirstName__c', matchMethodType: 'fuzzy' },
    { entityName: 'ssot__Individual__dlm', fieldName: 'ssot__LastName__c', matchMethodType: 'exact' },
    { entityName: 'ssot__ContactPointEmail__dlm', fieldName: 'ssot__EmailAddress__c', matchMethodType: 'exactnormalized' },
  ] }],
  reconciliationRules: [
    { entityName: 'ssot__Individual__dlm', linkDmoName: 'UnifiedLinkssotIndividualR001__dlm', unifiedDmoName: 'UnifiedssotIndividualR001__dlm', ruleType: 'lastupdated' },
  ],
}
const R = parseRulesets([RULESET, { rulesetId: 'acct', configurationType: 'account' }])[0]

// A fake query function over tables of objects; understands the few query forms used.
function fakeQ(tables) {
  const calls = []
  const q = async (sql) => {
    calls.push(sql)
    const table = sql.match(/FROM (\w+)/)[1]
    let rows = tables[table] || []
    const eq = sql.match(/WHERE (\w+) = '([^']*)'/)
    if (eq) rows = rows.filter((r) => r[eq[1]] === eq[2])
    const inm = sql.match(/WHERE (\w+) IN \(([^)]*)\)/)
    if (inm) { const vals = inm[2].split(', ').map((v) => v.slice(1, -1)); rows = rows.filter((r) => vals.includes(r[inm[1]])) }
    const alias = [...sql.matchAll(/(\w+) AS (\w+)/g)]
    if (alias.length && !sql.startsWith('SELECT *')) rows = rows.map((r) => Object.fromEntries(alias.map(([, f, a]) => [a, r[f]])))
    const columns = Object.keys(rows[0] || {}).map((name) => ({ name }))
    return { columns, rows: rows.map((r) => columns.map((c) => r[c.name])) }
  }
  q.calls = calls
  return q
}

describe('sql helpers', () => {
  it('quotes values and builds IN lists without blanks or duplicates', () => {
    expect(lit("O'Brien")).toBe("'O''Brien'")
    expect(inList(['a', 'a', null, '', 'b'])).toBe("('a', 'b')")
    expect(inList([null])).toBeNull()
    expect(toObjects({ columns: [{ name: 'a' }], rows: [[1]] })).toEqual([{ a: 1 }])
  })
})

describe('parseRulesets', () => {
  it('keeps individual rulesets with their unified and link DMOs', () => {
    expect(R).toMatchObject({ id: 'R001', unified: 'UnifiedssotIndividualR001__dlm', link: 'UnifiedLinkssotIndividualR001__dlm' })
    expect(R.rules[0].criteria.map((c) => c.method)).toEqual(['fuzzy', 'exact', 'exactnormalized'])
  })
})

describe('search', () => {
  it('tells the kinds apart', () => {
    expect(searchKind('a@b.com')).toBe('email')
    expect(searchKind('+1 (415) 555-0100')).toBe('phone')
    expect(searchKind('003jV00000E4s0mQAB')).toBe('id')
    expect(searchKind('Greg Walker')).toBe('name')
    expect(searchKind('  ')).toBeNull()
  })
  it('builds SQL: exact lower-case email, wildcard with ILIKE, phone without country code', () => {
    expect(searchSql('Info@X.com').sql).toContain("WHERE LOWER(ssot__EmailAddress__c) = 'info@x.com'")
    expect(searchSql('*@x.com').sql).toContain("ILIKE '%@x.com'")
    const phone = searchSql('+1 (415) 555').sql
    expect(phone).toContain("LIKE '%1415555%'")
    expect(phone).toContain("LIKE '%415555%'")
    expect(searchSql("o'brien").sql).toContain("ILIKE '%o''brien%'")
  })
  it('groups people by unified profile', async () => {
    const q = fakeQ({
      ssot__Individual__dlm: [
        { ssot__Id__c: 's1', ssot__FirstName__c: 'Greg', ssot__LastName__c: 'Walker' },
        { ssot__Id__c: 's2', ssot__FirstName__c: 'Gregory', ssot__LastName__c: 'Walker' },
        { ssot__Id__c: 's3', ssot__FirstName__c: 'Ann', ssot__LastName__c: 'Lee' },
      ],
      ssot__ContactPointEmail__dlm: [
        { ssot__PartyId__c: 's1', ssot__EmailAddress__c: 'g@x.com' },
        { ssot__PartyId__c: 's2', ssot__EmailAddress__c: 'g@x.com' },
        { ssot__PartyId__c: 's3', ssot__EmailAddress__c: 'g@x.com' },
      ],
      UnifiedLinkssotIndividualR001__dlm: [
        { SourceRecordId__c: 's1', UnifiedRecordId__c: 'u1' },
        { SourceRecordId__c: 's2', UnifiedRecordId__c: 'u1' },
      ],
    })
    // the fake ignores the email WHERE; every email row matches
    const r = await search(q, 'g@x.com', R)
    expect(r.kind).toBe('email')
    expect(r.groups.map((g) => [g.unifiedId, g.sources.map((s) => s.name)])).toEqual([
      ['u1', ['Greg Walker', 'Gregory Walker']],
      [null, ['Ann Lee']],
    ])
  })
})

const CATALOG = [
  { name: 'ssot__Individual__dlm', category: 'Profile', fields: [], relationships: [
    { from: 'ssot__ContactPointEmail__dlm', to: 'ssot__Individual__dlm', fromField: 'ssot__PartyId__c', toField: 'ssot__Id__c' },
    { from: 'ssot__Individual__dlm', to: 'ssot__Account__dlm', fromField: 'ssot__PrimaryAccountId__c', toField: 'ssot__Id__c' },
  ] },
  { name: 'ssot__ContactPointEmail__dlm', category: 'Related', fields: [], relationships: [
    { from: 'ssot__ContactPointEmail__dlm', to: 'ssot__Individual__dlm', fromField: 'ssot__PartyId__c', toField: 'ssot__Id__c' },
  ] },
  { name: 'ssot__Account__dlm', category: 'Profile', fields: [], relationships: [] },
  { name: 'ssot__WebsiteEngagement__dlm', category: 'Engagement', relationships: [
    { from: 'ssot__WebsiteEngagement__dlm', to: 'ssot__Individual__dlm', fromField: 'ssot__IndividualId__c', toField: 'ssot__Id__c' },
  ], fields: [
    { name: 'ssot__CreatedDate__c', type: 'DATE_TIME' },
    { name: 'ssot__EngagementDateTm__c', type: 'DATE_TIME', businessType: 'DATE_TIME' },
  ] },
]

describe('related objects', () => {
  it('follows relationships in both directions, once each', () => {
    expect(relatedTo('ssot__Individual__dlm', CATALOG)).toEqual([
      { object: 'ssot__Account__dlm', objectField: 'ssot__PrimaryAccountId__c', otherField: 'ssot__Id__c', category: 'Profile' },
      { object: 'ssot__ContactPointEmail__dlm', objectField: 'ssot__Id__c', otherField: 'ssot__PartyId__c', category: 'Related' },
      { object: 'ssot__WebsiteEngagement__dlm', objectField: 'ssot__Id__c', otherField: 'ssot__IndividualId__c', category: 'Engagement' },
    ])
  })
  it('picks the engagement time field', () => {
    expect(eventTimeField(CATALOG[3])).toBe('ssot__EngagementDateTm__c')
    expect(eventTimeField({ fields: [] })).toBeNull()
  })
  it('queries each related object by the profile values, newest first for engagement', async () => {
    const q = fakeQ({
      ssot__ContactPointEmail__dlm: [{ ssot__PartyId__c: 's1', ssot__EmailAddress__c: 'a@x.com' }],
      ssot__WebsiteEngagement__dlm: [{ ssot__IndividualId__c: 's1', ssot__EngagementDateTm__c: '2026-10-01' }],
    })
    const out = await loadRelated(q, 'ssot__Individual__dlm', [{ ssot__Id__c: 's1', ssot__PrimaryAccountId__c: null }], CATALOG)
    expect(out.map((r) => `${r.object}:${r.rows.length}`)).toEqual(['ssot__Account__dlm:0', 'ssot__ContactPointEmail__dlm:1', 'ssot__WebsiteEngagement__dlm:1'])
    expect(out[0].sql).toBe('') // no account ID, no query
    expect(out[2].sql).toContain('ORDER BY ssot__EngagementDateTm__c DESC')
  })
})

describe('loadProfile', () => {
  const tables = {
    UnifiedLinkssotIndividualR001__dlm: [
      { SourceRecordId__c: 's1', UnifiedRecordId__c: 'u1', MatchKeys__c: 'k' },
      { SourceRecordId__c: 's2', UnifiedRecordId__c: 'u1' },
    ],
    UnifiedssotIndividualR001__dlm: [{ ssot__Id__c: 'u1', ssot__FirstName__c: 'Greg' }],
    ssot__Individual__dlm: [{ ssot__Id__c: 's1' }, { ssot__Id__c: 's2' }, { ssot__Id__c: 's9' }],
  }
  it('loads a unified profile with its links and sources', async () => {
    const p = await loadProfile(fakeQ(tables), { unifiedId: 'u1', ruleset: R })
    expect(p.unified.ssot__FirstName__c).toBe('Greg')
    expect(p.sources.map((s) => s.ssot__Id__c)).toEqual(['s1', 's2'])
  })
  it('finds the unified profile of a source record', async () => {
    const p = await loadProfile(fakeQ(tables), { sourceId: 's2', ruleset: R })
    expect(p.unifiedId).toBe('u1')
    expect(p.sources).toHaveLength(2)
  })
  it('shows a source record that is not unified on its own', async () => {
    const p = await loadProfile(fakeQ(tables), { sourceId: 's9', ruleset: R })
    expect(p).toMatchObject({ unifiedId: null, unified: null, links: [] })
    expect(p.sources.map((s) => s.ssot__Id__c)).toEqual(['s9'])
  })
})

describe('match explanation', () => {
  it('normalizes and compares', () => {
    expect(normalize(' A@X.COM ', 'exactnormalized', 'ssot__EmailAddress__c')).toBe('a@x.com')
    expect(normalize('(415) 555-0100', 'exactnormalized', 'ssot__TelephoneNumber__c')).toBe('4155550100')
    expect(similarity('Greg', 'Gregory')).toBeGreaterThan(0.85)
    expect(similarity('Greg', 'Ann')).toBeLessThan(0.5)
    expect(criterionMatches({ method: 'exact' }, ['Walker'], ['walker'])).toBe(true)
    expect(criterionMatches({ method: 'exact', caseSensitive: true }, ['Walker'], ['walker'])).toBe(false)
    expect(criterionMatches({ method: 'exact' }, [], [])).toBe(false)
    expect(criterionMatches({ method: 'exact', matchOnBlank: true }, [''], [''])).toBe(true)
  })
  it('finds the pairs that satisfy every criterion', () => {
    const sources = [
      { ssot__Id__c: 's1', ssot__FirstName__c: 'Greg', ssot__LastName__c: 'Walker' },
      { ssot__Id__c: 's2', ssot__FirstName__c: 'Gregory', ssot__LastName__c: 'Walker' },
      { ssot__Id__c: 's3', ssot__FirstName__c: 'Ann', ssot__LastName__c: 'Walker' },
    ]
    const related = [{ object: 'ssot__ContactPointEmail__dlm', objectField: 'ssot__Id__c', otherField: 'ssot__PartyId__c', rows: [
      { ssot__PartyId__c: 's1', ssot__EmailAddress__c: 'G@x.com' },
      { ssot__PartyId__c: 's2', ssot__EmailAddress__c: 'g@x.com ' },
      { ssot__PartyId__c: 's3', ssot__EmailAddress__c: 'g@x.com' },
    ] }]
    const [e] = explainMatches(R, sources, related)
    expect(e.pairs).toEqual([['s1', 's2']])
    expect(e.table[2].values).toEqual({ s1: ['G@x.com'], s2: ['g@x.com '], s3: ['g@x.com'] })
  })
  it('lists others with the same email', async () => {
    const q = fakeQ({ ssot__ContactPointEmail__dlm: [{ ssot__PartyId__c: 's7', ssot__EmailAddress__c: 'g@x.com', ssot__FirstName__c: 'Ann', ssot__LastName__c: 'Lee' }] })
    const related = [{ object: 'ssot__ContactPointEmail__dlm', objectField: 'ssot__Id__c', rows: [{ ssot__EmailAddress__c: 'G@x.com' }] }]
    const out = await possibleMissedMatches(q, ['s1'], related)
    expect(q.calls[0]).toContain("LOWER(e.ssot__EmailAddress__c) IN ('g@x.com') AND e.ssot__PartyId__c NOT IN ('s1')")
    expect(out).toEqual([{ id: 's7', name: 'Ann Lee', shared: 'g@x.com' }])
  })
})

describe('profileMarkdown', () => {
  it('includes the unified record, sources, match keys and related rows', () => {
    const md = profileMarkdown({
      ruleset: R,
      profile: { unifiedId: 'u1', unified: { ssot__Id__c: 'u1', ssot__FirstName__c: 'Greg' }, links: [{ SourceRecordId__c: 's1', MatchKeys__c: 'k1' }], sources: [{ ssot__Id__c: 's1', ssot__FirstName__c: 'Greg', ssot__LastName__c: 'W' }] },
      related: [{ object: 'ssot__WebsiteEngagement__dlm', category: 'Engagement', rows: [{ a: '1|2', b: null }], more: false }],
      explanation: [],
    })
    expect(md).toContain('# Profile u1')
    expect(md).toContain('| `ssot__FirstName__c` | Greg |')
    expect(md).toContain('| MatchKeys__c (link) | k1 |')
    expect(md).toContain('## ssot__WebsiteEngagement__dlm (1 rows, Engagement)')
    expect(md).toContain('| 1\\|2 |')
  })
})
