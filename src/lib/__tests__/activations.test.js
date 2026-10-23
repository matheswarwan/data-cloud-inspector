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
