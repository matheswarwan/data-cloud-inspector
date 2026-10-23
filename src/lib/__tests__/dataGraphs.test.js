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
      name: 'ssot__Individual__dlm', label: 'ssot__Individual__dlm', via: 'dgObject', fields: ['ssot__FirstName__c', 'ssot__LastName__c'],
      children: [{ name: 'ssot__ContactPointEmail__dlm', label: 'ssot__ContactPointEmail__dlm', via: 'relatedObjects', fields: [], children: [] }],
    }])
  })
})
