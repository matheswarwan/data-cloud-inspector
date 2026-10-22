import { fetchAllPages } from '../pages.js'
import { loadStreams, loadMappings, loadAllMappings } from '../lineage.js'

describe('fetchAllPages', () => {
  it('follows nextPageUrl as given, even with odd offsets', async () => {
    const seen = []
    const call = async (path) => {
      seen.push(path)
      if (path === '/a') return { ok: true, data: { items: [1, 2], nextPageUrl: '/a?offset=11' } }
      return { ok: true, data: { items: [3] } }
    }
    expect(await fetchAllPages(call, '/a', 'items')).toEqual([1, 2, 3])
    expect(seen).toEqual(['/a', '/a?offset=11'])
  })
  it('throws when the first page fails, keeps what it has when a later one does', async () => {
    await expect(fetchAllPages(async () => ({ ok: false, error: 'nope' }), '/a', 'items')).rejects.toThrow('nope')
    const call = async (p) => (p === '/a' ? { ok: true, data: { items: [1], nextPageUrl: '/b' } } : { ok: false, error: 'x' })
    expect(await fetchAllPages(call, '/a', 'items')).toEqual([1])
  })
})

describe('loadStreams', () => {
  it('flattens the stream fields the explorer uses', async () => {
    const call = async () => ({ ok: true, data: { dataStreams: [{
      name: 'Contact_Home', label: 'Contact_Home', status: 'ACTIVE', lastRunStatus: 'NONE',
      dataLakeObjectInfo: { name: 'Contact_Home__dll' },
      connectorInfo: { connectorType: 'SalesforceDotCom', connectorDetails: { sourceObject: 'Contact' } },
      refreshConfig: { frequency: { frequencyType: 'BATCH' } },
    }] } })
    const [s] = await loadStreams(call, '68.0')
    expect(s).toMatchObject({ dlo: 'Contact_Home__dll', connector: 'SalesforceDotCom', sourceObject: 'Contact', frequency: 'BATCH', lastRunStatus: 'NONE' })
  })
})

describe('mappings', () => {
  const body = { objectSourceTargetMaps: [{
    developerName: 'm1', sourceEntityDeveloperName: 'Contact_Home__dll', targetEntityDeveloperName: 'ssot__Individual__dlm', status: 'ACTIVE',
    fieldMappings: [{ sourceFieldDeveloperName: 'FirstName__c', targetFieldDeveloperName: 'ssot__FirstName__c' }],
  }] }
  it('reads one DMO and asks with the DMO name', async () => {
    let asked
    const list = await loadMappings(async (p) => { asked = p; return { ok: true, data: body } }, '68.0', 'ssot__Individual__dlm')
    expect(asked).toBe('/services/data/v68.0/ssot/data-model-object-mappings?dataspace=default&dmoDeveloperName=ssot__Individual__dlm')
    expect(list[0]).toEqual({ name: 'm1', source: 'Contact_Home__dll', target: 'ssot__Individual__dlm', status: 'ACTIVE', fields: [{ source: 'FirstName__c', target: 'ssot__FirstName__c' }] })
  })
  it('reads every DMO, skipping failures, and reports progress', async () => {
    const progress = []
    const call = async (p) => (p.includes('Bad') ? { ok: false, error: 'x' } : { ok: true, data: body })
    const all = await loadAllMappings(call, '68.0', ['A', 'Bad', 'C'], { concurrency: 2, onProgress: (d, t) => progress.push(`${d}/${t}`) })
    expect(all).toHaveLength(2)
    expect(progress).toEqual(['2/3', '3/3'])
  })
})
