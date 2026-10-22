import { recordKind, recordUrl, dmoUrl, loadRecordIds } from '../links.js'
import { fetchAllPages } from '../pages.js'
import { EXAMPLES, examplePath } from '../exploreExamples.js'

describe('links', () => {
  it('recognises linkable record IDs only', () => {
    expect(recordKind('1sgjV000000Cmk1QAC')).toBe('Segment')
    expect(recordKind('003jV00000E4ryX')).toBe('Contact')
    expect(recordKind('0gjjV0000027kOxQAI')).toBeNull() // DMO pages have no record URL
    expect(recordKind('1sgjV000000Cmk1QA')).toBeNull() // 17 characters
    expect(recordKind('hello world')).toBeNull()
    expect(recordKind(42)).toBeNull()
  })
  it('builds org URLs', () => {
    expect(recordUrl('acme.my.salesforce.com', '1ds000000000001AAA')).toBe('https://acme.my.salesforce.com/1ds000000000001AAA')
    expect(recordUrl(null, 'x')).toBeNull()
    expect(dmoUrl('acme--uat.sandbox.my.salesforce.com', 'ssot__AccountContact__dlm')).toBe('https://acme--uat.sandbox.lightning.force.com/lightning/n/standard-DataModel?c__objectApiName=ssot__AccountContact__dlm')
  })
  it('collects DLO, DMO and CI record IDs by API name', async () => {
    const call = async (path) => {
      if (path.includes('data-lake-objects')) return { ok: true, data: { dataLakeObjects: [{ name: 'Contact_Home__dll', id: '1dlA' }] } }
      if (path.includes('data-model-objects')) return { ok: true, data: { dataModelObject: [{ name: 'ssot__Individual__dlm', id: '0gjB' }] } }
      return { ok: true, data: { records: [{ Id: '0kXC', Name: 'Daily' }] } }
    }
    expect(await loadRecordIds(call, '68.0', fetchAllPages)).toEqual({ Contact_Home__dll: '1dlA', ssot__Individual__dlm: '0gjB', Daily__cio: '0kXC' })
  })
})

describe('explore examples', () => {
  it('are relative API paths, read only', () => {
    for (const g of EXAMPLES) for (const item of g.items) {
      expect(item.path.startsWith('/')).toBe(false)
      if (item.method === 'POST') expect(item.path).toMatch(/^ssot\/query(-sql|v2)$/)
    }
    expect(examplePath({ path: 'limits' }, '68.0')).toBe('/services/data/v68.0/limits')
  })
})
