import { sqlRefs, criteriaRefs, usageOf, fieldUsage } from '../usage.js'

describe('sqlRefs', () => {
  it('reads fully qualified fields, as on the live org', () => {
    const r = sqlRefs('SELECT DATE_ADD(ssot__PersonalizationLog__dlm.ssot__RequestDateTime__c,0) as RequestDate__c, ssot__PersonalizationPoint__dlm.ssot__Name__c FROM ssot__PersonalizationLog__dlm LEFT JOIN ssot__PersonalizationPoint__dlm ON x = y')
    expect([...r.ssot__PersonalizationLog__dlm]).toEqual(['ssot__RequestDateTime__c'])
    expect([...r.ssot__PersonalizationPoint__dlm]).toEqual(['ssot__Name__c'])
  })
  it('follows aliases and decodes HTML entities', () => {
    const r = sqlRefs('SELECT i.ssot__FirstName__c, e.ssot__EmailAddress__c FROM ssot__Individual__dlm AS i JOIN ssot__ContactPointEmail__dlm e ON e.ssot__PartyId__c = i.ssot__Id__c WHERE i.ssot__LastName__c = &#39;x&#39;')
    expect([...r.ssot__Individual__dlm].sort()).toEqual(['ssot__FirstName__c', 'ssot__Id__c', 'ssot__LastName__c'])
    expect([...r.ssot__ContactPointEmail__dlm].sort()).toEqual(['ssot__EmailAddress__c', 'ssot__PartyId__c'])
  })
  it('does not take keywords for aliases', () => {
    const r = sqlRefs('SELECT COUNT(*) FROM ssot__Individual__dlm WHERE x = 1')
    expect(Object.keys(r)).toEqual(['ssot__Individual__dlm'])
  })
})

describe('usage', () => {
  const usage = {
    insights: [{ name: 'A__cio', label: 'A', refs: sqlRefs('SELECT ssot__Individual__dlm.ssot__FirstName__c FROM ssot__Individual__dlm') }],
    segments: [
      { name: 'S1', label: 'S1', id: '1sgAAAAAAAAAAAAQAC', on: 'ssot__Individual__dlm', refs: criteriaRefs({ operator: 'and', filters: [{ subject: { objectApiName: 'ssot__Individual__dlm', fieldApiName: 'ssot__PersonName__c' } }, { subject: { objectApiName: 'ssot__ContactPointEmail__dlm', fieldApiName: 'ssot__EmailAddress__c' } }] }) },
      { name: 'S2', label: 'S2', id: '1sgB', on: 'Other__dlm', refs: {} },
    ],
    activations: [{ name: 'Act', id: '85R', segmentId: '1sgAAAAAAAAAAAA', target: 'T', status: 'SUCCESS' }],
  }
  it('lists what uses an object, with fields and activations', () => {
    const u = usageOf('ssot__Individual__dlm', usage)
    expect(u.insights).toEqual([{ name: 'A__cio', label: 'A', fields: ['ssot__FirstName__c'] }])
    expect(u.segments.map((s) => [s.name, s.isOn, s.fields, s.activations.map((a) => a.name)])).toEqual([['S1', true, ['ssot__PersonName__c'], ['Act']]])
    expect(usageOf('ssot__ContactPointEmail__dlm', usage).segments[0]).toMatchObject({ name: 'S1', isOn: false, fields: ['ssot__EmailAddress__c'] })
    expect(usageOf('x', null)).toBeNull()
  })
  it('maps fields to what uses them', () => {
    const m = fieldUsage('ssot__Individual__dlm', usage)
    expect(m.get('ssot__FirstName__c')).toEqual(['A (insight)'])
    expect(m.get('ssot__PersonName__c')).toEqual(['S1 (segment)'])
  })
})
