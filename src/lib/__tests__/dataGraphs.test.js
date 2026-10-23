import { resolveObject, joinBetween, graphSql, graphRecordPath, expandJson, objectTree as tree2 } from '../dataGraphs.js'
import { nameOf, labelOf, scalars, objectTree } from '../dataGraphs.js'

const graph = {
  developerName: 'Customer360', label: 'Customer 360', status: 'Active', dataSpaceName: 'default',
  dgObject: [{
    developerName: 'ssot__Individual__dlm', fields: [{ developerName: 'ssot__FirstName__c' }, 'ssot__LastName__c'],
    relatedObjects: [{ developerName: 'ssot__ContactPointEmail__dlm', fields: [] }],
  }],
}

describe('data graphs', () => {
  it('reads names, labels and scalar properties', () => {
    expect(nameOf(graph)).toBe('Customer360')
    expect(labelOf(graph)).toBe('Customer 360')
    expect(scalars(graph).map(([k]) => k)).toEqual(['developerName', 'label', 'status', 'dataSpaceName'])
  })
  it('walks nested objects into a tree', () => {
    expect(objectTree(graph)).toEqual([{
      name: 'ssot__Individual__dlm', label: 'ssot__Individual__dlm', via: 'dgObject', fields: ['ssot__FirstName__c', 'ssot__LastName__c'], join: null,
      children: [{ name: 'ssot__ContactPointEmail__dlm', label: 'ssot__ContactPointEmail__dlm', via: 'relatedObjects', fields: [], join: null, children: [] }],
    }])
  })
})


const obj = (name, label, fields, pk, relationships = []) => ({ name, label, kind: 'DMO', fields: fields.map((f) => ({ name: f })), primaryKeys: pk, relationships })
const individual = obj('ssot__Individual__dlm', 'Individual', ['ssot__Id__c', 'ssot__FirstName__c', 'ssot__LastName__c'], ['ssot__Id__c'])
const email = obj('ssot__ContactPointEmail__dlm', 'Contact Point Email', ['ssot__Id__c', 'ssot__PartyId__c', 'ssot__EmailAddress__c'], ['ssot__Id__c'], [
  { from: 'ssot__ContactPointEmail__dlm', fromField: 'ssot__PartyId__c', to: 'ssot__Individual__dlm', toField: 'ssot__Id__c', cardinality: 'NTOONE' },
])
const web = obj('ssot__WebsiteEngagement__dlm', 'Website Engagement', ['ssot__Id__c'], ['ssot__Id__c'])
const catalog = [individual, email, web]
const sqlGraph = {
  developerName: 'Customer360',
  primaryObjectName: 'ssot__Individual__dlm',
  dgObject: {
    developerName: 'ssot__Individual__dlm',
    fields: [{ developerName: 'ssot__Id__c' }, { developerName: 'ssot__FirstName__c' }],
    relatedObjects: [
      { developerName: 'ssot__ContactPointEmail__dlm', fields: [{ developerName: 'ssot__EmailAddress__c' }] },
      { developerName: 'ssot__WebsiteEngagement__dlm', fields: [] },
    ],
  },
}

describe('data graphs to SQL', () => {
  it('walks a single root object', () => {
    const t = tree2(sqlGraph)
    expect(t.map((x) => x.name)).toEqual(['ssot__Individual__dlm'])
    expect(t[0].children.map((x) => x.name)).toEqual(['ssot__ContactPointEmail__dlm', 'ssot__WebsiteEngagement__dlm'])
  })
  it('resolves objects by name, with __dlm, or by label', () => {
    expect(resolveObject('ssot__Individual', catalog)).toBe(individual)
    expect(resolveObject('contact point email', catalog)).toBe(email)
    expect(resolveObject('nope', catalog)).toBeNull()
  })
  it('finds the join in either direction', () => {
    expect(joinBetween(individual, email)).toEqual({ childField: 'ssot__PartyId__c', parentField: 'ssot__Id__c' })
    expect(joinBetween(email, individual)).toEqual({ parentField: 'ssot__PartyId__c', childField: 'ssot__Id__c' })
    expect(joinBetween(individual, web)).toBeNull()
  })
  it('builds the SELECT with the graph fields and notes what it left out', () => {
    const { sql, notes } = graphSql(sqlGraph, catalog)
    expect(sql).toContain('t0.ssot__Id__c AS t0_ssot__Id__c')
    expect(sql).toContain('t0.ssot__FirstName__c AS t0_ssot__FirstName__c')
    expect(sql).not.toContain('t0.ssot__LastName__c')
    expect(sql).toContain('FROM ssot__Individual__dlm t0\nLEFT JOIN ssot__ContactPointEmail__dlm t1 ON t1.ssot__PartyId__c = t0.ssot__Id__c')
    expect(sql).toContain('t1.ssot__EmailAddress__c AS t1_ssot__EmailAddress__c')
    expect(sql).toMatch(/LIMIT 100$/)
    expect(notes).toEqual(['No relationship between ssot__Individual__dlm and ssot__WebsiteEngagement__dlm in the metadata, so ssot__WebsiteEngagement__dlm is left out.'])
    expect(sql).toContain('-- No relationship between')
  })
  it('says so when nothing is in the catalog', () => {
    expect(graphSql({ developerName: 'x', dgObject: { developerName: 'Other__dlm' } }, catalog).sql).toBe('')
  })
  it('record path and JSON strings', () => {
    expect(graphRecordPath('68.0', 'Customer 360', '003/x')).toBe('/services/data/v68.0/ssot/data-graphs/data/Customer%20360/003%2Fx')
    expect(expandJson({ data: [{ json_blob__c: '{"a":[1,{"b":"{\\"c\\":2}"}]}' }], n: 'plain' })).toEqual({ data: [{ json_blob__c: { a: [1, { b: { c: 2 } }] } }], n: 'plain' })
  })
})

import { valuesSql, loadDataGraphs } from '../dataGraphs.js'

// The shape GET /ssot/data-graphs/<name> answered live (names made up, ids left out).
const liveGraph = {
  name: 'Test_Graph', label: 'Test Graph', primaryObjectName: 'ssot__Individual__dlm', primaryObjectLabel: 'Individual',
  status: 'ready', valuesDmoName: 'Test_Graph_123_VALUE__dlm', idDmoName: 'Test_Graph_123_ID__dlm',
  sourceObject: {
    name: 'ssot__Individual__dlm', label: 'Individual', devName: 'Test_Graph_Individual', jsonPath: '$', path: [],
    fields: [{ name: 'Test_Graph_Individual_FirstName', sourceFieldName: 'ssot__FirstName__c', isKeyColumn: false, dependency: [] }, { name: 'Test_Graph_Individual_Id', sourceFieldName: 'ssot__Id__c', isKeyColumn: true }],
    relatedSegments: [{ name: 'Some_Segment' }],
    relatedObjects: [{
      name: 'ssot__ContactPointEmail__dlm', label: 'Contact Point Email', jsonPath: '$.ssot__ContactPointEmail__dlm',
      path: [{ devName: 'DGRelationships_1', fieldName: 'ssot__PartyId__c', parentFieldName: 'ssot__Id__c' }],
      fields: [{ name: 'Test_Graph_ContactPointEmail_EmailAddress', sourceFieldName: 'ssot__EmailAddress__c' }],
      relatedObjects: [], recencyCriteria: [], topKFilterCriteria: { limit: 100, orderCriteria: [{ fieldApiName: 'ssot__Id__c' }] },
    }],
  },
}

describe('data graphs as Data Cloud returns them', () => {
  it('reads the root, its fields by source name, and the join from path', () => {
    const t = tree2(liveGraph)
    expect(t).toHaveLength(1)
    expect(t[0]).toMatchObject({ name: 'ssot__Individual__dlm', fields: ['ssot__FirstName__c', 'ssot__Id__c'] })
    expect(t[0].children).toHaveLength(1) // segments are not objects
    expect(t[0].children[0]).toMatchObject({ name: 'ssot__ContactPointEmail__dlm', join: { childField: 'ssot__PartyId__c', parentField: 'ssot__Id__c' } })
  })
  it('joins with the path even when the catalog has no relationship', () => {
    const noRel = [individual, { ...email, relationships: [] }]
    const { sql, notes } = graphSql(liveGraph, noRel)
    expect(notes).toEqual([])
    expect(sql).toContain('LEFT JOIN ssot__ContactPointEmail__dlm t1 ON t1.ssot__PartyId__c = t0.ssot__Id__c')
    expect(sql).toContain('t1.ssot__EmailAddress__c AS t1_ssot__EmailAddress__c')
  })
  it('queries the stored graph', () => {
    expect(valuesSql(liveGraph)).toContain('FROM Test_Graph_123_VALUE__dlm')
    expect(valuesSql({})).toBe('')
  })
  it('reads the metadata list shape too (dgObject, paths, developerName fields), without the ID and values tables', () => {
    const meta = { developerName: 'Test_Graph', primaryObjectName: 'ssot__Individual__dlm', idsDmo: { developerName: 'Test_Graph_1_ID__dlm', fields: [] }, valuesDmo: { developerName: 'Test_Graph_1_VALUE__dlm', fields: [] },
      dgObject: { developerName: 'ssot__Individual__dlm', fields: [{ developerName: 'ssot__Id__c' }], paths: [], relatedObjects: [{ developerName: 'ssot__ContactPointEmail__dlm', fields: [{ developerName: 'ssot__EmailAddress__c' }], paths: [{ cardinality: 'OneToMany', fieldName: 'ssot__PartyId__c', parentFieldName: 'ssot__Id__c' }], relatedObjects: [] }] } }
    const t = tree2(meta)
    expect(t.map((x) => x.name)).toEqual(['ssot__Individual__dlm'])
    expect(t[0].children[0]).toMatchObject({ fields: ['ssot__EmailAddress__c'], join: { childField: 'ssot__PartyId__c', parentField: 'ssot__Id__c' } })
  })
  it('expands the HTML-escaped json_blob__c', () => {
    expect(expandJson({ data: [{ json_blob__c: '{&quot;ssot__Id__c&quot;:&quot;a&amp;b&quot;,&quot;n&quot;:[1]}' }] })).toEqual({ data: [{ json_blob__c: { ssot__Id__c: 'a&b', n: [1] } }] })
  })
  it('lists from SOQL, in the data space, with definitions', async () => {
    const calls = []
    const call = async (path) => {
      calls.push(path)
      if (path.includes('/query?q=')) return { ok: true, data: { records: [
        { Id: 'g1', Name: 'Test Graph', DataGraphApiName: 'Test_Graph', DataSpaceId: '0vh000000000001AAA', Status: 'READY', LastRunStatus: 'SUCCESS', RecordCount: 5 },
        { Id: 'g2', Name: 'Other', DataGraphApiName: 'Other', DataSpaceId: '0vh000000000002AAA' },
      ] } }
      if (path.endsWith('/ssot/data-graphs/Test_Graph')) return { ok: true, data: liveGraph }
      return { ok: false, status: 404 }
    }
    const list = await loadDataGraphs(call, '68.0', { dataSpaceId: '0vh000000000001' })
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ name: 'Test_Graph', record: { status: 'READY', recordCount: 5 } })
    expect(calls.some((c) => c.includes('FROM%20DataGraph'))).toBe(true)
  })
})

describe('listing fallback', () => {
  it('uses the metadata list when SOQL fails', async () => {
    const call = async (path) => (path.includes('/query?q=') ? { ok: false, status: 400, error: 'INVALID_TYPE' } : { ok: true, data: { dataGraphMetadata: [{ developerName: 'G' }] } })
    expect(await loadDataGraphs(call, '68.0')).toEqual([{ developerName: 'G' }])
  })
})
