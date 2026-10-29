import { describe, it, expect } from 'vitest'
import { statementAt, tablesIn, fieldOptions } from '../sqlComplete.js'

const schema = { ssot__Individual__dlm: ['ssot__Id__c', 'ssot__FirstName__c'], ssot__ContactPointEmail__dlm: ['ssot__Id__c', 'ssot__EmailAddress__c'] }

describe('sqlComplete (feedback #1026)', () => {
  it('finds FROM and JOIN objects in any case, ignoring unknown ones', () => {
    expect(tablesIn('select x from SSOT__individual__dlm i join ssot__ContactPointEmail__dlm e on 1=1 join nope n', schema))
      .toEqual(['ssot__Individual__dlm', 'ssot__ContactPointEmail__dlm'])
  })
  it('offers each field once, labelled with its object', () => {
    const o = fieldOptions('SELECT  FROM ssot__Individual__dlm JOIN ssot__ContactPointEmail__dlm ON 1=1', schema)
    expect(o.map((x) => x.label)).toEqual(['ssot__Id__c', 'ssot__FirstName__c', 'ssot__EmailAddress__c'])
    expect(o[2].detail).toBe('ssot__ContactPointEmail__dlm')
  })
  it('looks only at the statement around the cursor', () => {
    const doc = 'SELECT 1 FROM a; SELECT ss FROM ssot__Individual__dlm; SELECT 2 FROM b'
    expect(statementAt(doc, doc.indexOf('ss FROM') + 2)).toBe(' SELECT ss FROM ssot__Individual__dlm')
  })
})
