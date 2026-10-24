import { normalizeActivation } from '../activations.js'

describe('activations', () => {
  it('normalizes attributes, contact points, filters and audiences', () => {
    const a = normalizeActivation({
      id: '85R1', name: 'Test Activation - 1', status: 'ACTIVE', refreshType: 'INCREMENTAL', processingType: 'Batch', segmentApiName: 'Test Segment - 1', activationTargetName: 'DC to Salesforce', activationTargetId: '85U1',
      activationTargetSubjectConfig: { developerName: 'ssot__Individual__dlm', masterLabel: 'Individual' },
      attributesConfig: { attributes: [{ entityName: 'ssot__Individual__dlm', name: 'ssot__Id__c', label: 'Individual Id', referenceAttributeName: 'Id', dataSourceType: 'Text' }] },
      contactPointsConfig: { contactPoints: [{ contactPointEntityName: 'ssot__ContactPointEmail__dlm', contactPointPath: '[[{&quot;fieldApiName&quot;:&quot;ssot__Id__c&quot;,&quot;objectApiName&quot;:&quot;ssot__Individual__dlm&quot;}]]' }] },
      directDmoFiltersConfig: { filters: [] }, relatedDmoFiltersConfig: { filters: [{ field: 'x' }] },
      latestAudienceDmoApiName: 'AAL__dlm', historyAudienceDmoApiName: 'AA__dlm',
    })
    expect(a).toMatchObject({ target: 'DC to Salesforce', subject: 'ssot__Individual__dlm', latestAudience: 'AAL__dlm', refreshType: 'INCREMENTAL' })
    expect(a.attributes).toEqual([{ name: 'ssot__Id__c', label: 'Individual Id', entity: 'ssot__Individual__dlm', output: 'Id', type: 'Text', source: '' }])
    expect(a.contactPoints).toEqual([{ entity: 'ssot__ContactPointEmail__dlm', path: ['ssot__Individual__dlm.ssot__Id__c'] }])
    expect(a.filters).toEqual(['{"field":"x"}'])
  })
})

import { describeActivationFilter } from '../activations.js'

describe('describeActivationFilter (feedback #115)', () => {
  const direct = JSON.stringify({ entityFilter: { attributeSource: 'DIRECT', entityName: 'Services__dlm', entityFilterType: 'EntityScopedGroup', condition: { type: 'LogicalComparison', operator: 'and', filters: [
    { type: 'TextComparison', filter: { operator: 'equal', subject: { fieldName: 'LOB_CD__c', objectName: 'Services__dlm' }, values: ['02'], filters: [] } },
    { type: 'RelativeToNowDateComparison', filter: { operator: 'in the last number of days', subject: { fieldName: 'OPEN_DT__c', objectName: 'Services__dlm' }, values: [5] } },
    { type: 'TextComparison', filter: { operator: 'has value', subject: { fieldName: 'SERVICE_ID__c', objectName: 'Services__dlm' }, values: [] } },
    { type: 'LogicalComparison', filter: { operator: 'or', filters: [
      { type: 'TextComparison', filter: { operator: 'in', subject: { fieldName: 'ssot__DataSourceId__c', objectName: 'ssot__Individual__dlm' }, values: ['E', 'F'] } },
    ] } },
  ] } } })
  it('reads an entity filter as nested plain lines', () => {
    expect(describeActivationFilter(direct)).toEqual([
      { depth: 0, text: 'Direct filter on Services:' },
      { depth: 1, text: 'All of these (AND):' },
      { depth: 2, text: 'Services.LOB_CD is "02"' },
      { depth: 2, text: 'Services.OPEN_DT is in the last 5 days' },
      { depth: 2, text: 'Services.SERVICE_ID has a value' },
      { depth: 2, text: 'Any of these (OR):' },
      { depth: 3, text: 'Individual.DataSourceId is one of "E", "F"' },
    ])
  })
  it('reads a related-row limit', () => {
    expect(describeActivationFilter(JSON.stringify({ entityName: 'Ref_Wireless_Equipment__dlm', filterLimit: 1, attributeName: 'HL_HANDSET_MODEL_GROUP__c', maxNumberOfValues: 1, order: 'DESC' }))).toEqual([
      { depth: 0, text: 'Keep at most 1 Ref_Wireless_Equipment row, ordered by HL_HANDSET_MODEL_GROUP descending' },
    ])
  })
  it('reads related paths and gives up on other text', () => {
    const rel = describeActivationFilter({ entityFilter: { attributeSource: 'RELATED', condition: { type: 'TextComparison', filter: { operator: 'equal', path: { subjects: [{ labeledSubjects: [{ fieldName: 'SOCSYS_ID__c', objectName: 'Service_SOC__dlm' }, { fieldName: 'TIER_2__c', objectName: 'Ref_Wireless_SOC__dlm' }] }] }, values: ['SPC'] } } } })
    expect(rel[1].text).toBe('Service_SOC.SOCSYS_ID via Ref_Wireless_SOC.TIER_2 is "SPC"')
    expect(describeActivationFilter('not json')).toBeNull()
    expect(describeActivationFilter('{"x":1}')).toBeNull()
  })
})

import { activationMarkdown } from '../activations.js'

describe('activationMarkdown', () => {
  it('has the details, attributes, filters in words and as JSON, and the audience', () => {
    const act = { name: 'Test', developerName: 'Test_1', segment: 'Seg', target: 'SFMC', status: 'ACTIVE', enabled: true, lastPublishStatus: 'SUCCESS', lastPublish: '2026-10-23T08:48:50Z', refreshType: 'FULL_REFRESH', processing: 'BATCH', subject: 'ssot__Individual__dlm', subjectLabel: 'Individual',
      attributes: [{ entity: 'Services', name: 'TN__c', label: 'TN', output: 'TN__c', type: 'Text' }], contactPoints: [{ entity: 'ssot__ContactPointEmail__dlm', path: ['A.b', 'C.d'] }],
      filters: [JSON.stringify({ entityFilter: { attributeSource: 'DIRECT', condition: { type: 'TextComparison', filter: { operator: 'equal', subject: { fieldName: 'X__c', objectName: 'S__dlm' }, values: ['1'] } } } })],
      latestAudience: 'AAL__dlm', historyAudience: '', latestAudienceRun: '' }
    const md = activationMarkdown(act, { counts: { AAL__dlm: 3129882 } })
    expect(md).toContain('| Last publish | success, 2026-10-23 08:48 UTC |')
    expect(md).toContain('| `Services.TN__c` | TN | `TN__c` | Text |')
    expect(md).toContain('through `A.b` → `C.d`')
    expect(md).toContain('  - S.X is "1"')
    expect(md).toContain('```json\n{\n  "entityFilter"')
    expect(md).toContain('- Latest: `AAL__dlm`, 3,129,882 rows')
  })
})
