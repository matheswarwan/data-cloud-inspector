import { normalizeObject, loadCatalog, filterObjects, sqlSchema, selectFor, objectMarkdown } from '../catalog.js'

const DMO = {
  name: 'ssot__Individual__dlm', displayName: 'Individual', category: 'Profile', referenceModelEntityDeveloperName: 'Individual',
  fields: [
    { name: 'ssot__Id__c', displayName: 'Individual Id', type: 'STRING', businessType: 'TEXT' },
    { name: 'ssot__FirstName__c', displayName: 'First Name', type: 'STRING', businessType: 'TEXT' },
  ],
  primaryKeys: [{ name: 'ssot__Id__c', indexOrder: '1' }],
  relationships: [{ fromEntity: 'ssot__Party__dlm', toEntity: 'ssot__Individual__dlm', fromEntityAttribute: 'ssot__IndividualId__c', toEntityAttribute: 'ssot__Id__c', cardinality: 'NTOONE' }],
}
const CI = {
  name: 'Daily__cio', displayName: 'Daily', partitionBy: 'RequestDate__c', latestProcessTime: '2026-10-22T16:18:26Z',
  dimensions: [{ name: 'RequestDate__c', displayName: 'RequestDate', type: 'DATE', businessType: 'DATE' }],
  measures: [{ name: 'Num__c', displayName: 'Num', type: 'NUMBER', businessType: 'NUMBER' }],
  relationships: [{ fromEntity: 'ssot__PersonalizationLog__dlm', toEntity: 'Daily__cio' }],
}

describe('normalizeObject', () => {
  it('marks primary keys and keeps relationships', () => {
    const o = normalizeObject(DMO, 'DMO')
    expect(o.fields[0]).toMatchObject({ name: 'ssot__Id__c', label: 'Individual Id', primaryKey: true })
    expect(o.fields[1].primaryKey).toBe(false)
    expect(o.relationships[0]).toEqual({ from: 'ssot__Party__dlm', to: 'ssot__Individual__dlm', fromField: 'ssot__IndividualId__c', toField: 'ssot__Id__c', cardinality: 'NTOONE' })
    expect(o.reference).toBe('Individual')
  })
  it('turns CI dimensions and measures into fields with a role', () => {
    const o = normalizeObject(CI, 'CI')
    expect(o.fields.map((f) => `${f.name}:${f.role}`)).toEqual(['RequestDate__c:dimension', 'Num__c:measure'])
    expect(o.partitionBy).toBe('RequestDate__c')
  })
})

describe('loadCatalog', () => {
  it('loads every entity type and reports a failed one without failing', async () => {
    const call = async (path) => {
      if (path.endsWith('DataModelObject')) return { ok: true, data: { metadata: [DMO] } }
      if (path.endsWith('CalculatedInsight')) return { ok: true, data: { metadata: [CI] } }
      return { ok: false, status: 500, error: 'boom' }
    }
    const c = await loadCatalog(call, '68.0')
    expect(c.objects.map((o) => `${o.kind}:${o.name}`)).toEqual(['CI:Daily__cio', 'DMO:ssot__Individual__dlm'])
    expect(c.errors).toEqual(['DataLakeObject: boom'])
  })
})

describe('helpers', () => {
  const objects = [normalizeObject(DMO, 'DMO'), normalizeObject(CI, 'CI')]
  it('filters by text, kind and category', () => {
    expect(filterObjects(objects, { text: 'indiv' }).map((o) => o.kind)).toEqual(['DMO'])
    expect(filterObjects(objects, { kinds: ['CI'] }).map((o) => o.kind)).toEqual(['CI'])
    expect(filterObjects(objects, { category: 'Profile' })).toHaveLength(1)
  })
  it('builds the autocomplete schema and a SELECT', () => {
    expect(sqlSchema(objects)['ssot__Individual__dlm']).toEqual(['ssot__Id__c', 'ssot__FirstName__c'])
    expect(selectFor(objects[0])).toBe('SELECT\n  ssot__Id__c,\n  ssot__FirstName__c\nFROM ssot__Individual__dlm\nLIMIT 100')
  })
  it('writes Markdown with fields and relationships', () => {
    const md = objectMarkdown(objects[0])
    expect(md).toContain('| `ssot__FirstName__c` | First Name | TEXT |')
    expect(md).toContain('primary key `ssot__Id__c`')
    expect(md).toContain('`ssot__Party__dlm.ssot__IndividualId__c` to `ssot__Individual__dlm.ssot__Id__c` (NTOONE)')
  })
})

describe('looking up an object the list leaves out (feedback #1012)', () => {
  it('names a DLO by default and reads one row', async () => {
    const { lookupName, lookupObject } = await import('../catalog.js')
    expect(lookupName('TenantBillingUsageEvent')).toBe('TenantBillingUsageEvent__dll')
    expect(lookupName('"TenantBillingUsageEvent__dll"')).toBe('TenantBillingUsageEvent__dll')
    expect(lookupName('ssot__Individual__dlm')).toBe('ssot__Individual__dlm')
    expect(lookupName('two words')).toBe('')
    const asked = []
    const r = await lookupObject(async (sql) => { asked.push(sql); return { columns: [{ name: 'UsageValue__c', type: 'DECIMAL' }], rows: [] } }, 'TenantBillingUsageEvent__dll')
    expect(asked).toEqual(['SELECT * FROM TenantBillingUsageEvent__dll LIMIT 1'])
    expect(r).toEqual({ name: 'TenantBillingUsageEvent__dll', columns: [{ name: 'UsageValue__c', type: 'DECIMAL' }], rows: 0 })
  })
})
