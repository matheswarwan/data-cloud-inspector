import { withDataSpace, spacesOf, inSpace } from '../dataSpace.js'
import { loadMappings, loadStreams } from '../lineage.js'

describe('withDataSpace', () => {
  it('adds dataspace only to endpoints that honour it', () => {
    expect(withDataSpace('/services/data/v68.0/ssot/query-sql', 'emea')).toBe('/services/data/v68.0/ssot/query-sql?dataspace=emea')
    expect(withDataSpace('/services/data/v68.0/ssot/metadata?entityType=DataModelObject', 'emea')).toBe('/services/data/v68.0/ssot/metadata?entityType=DataModelObject&dataspace=emea')
    expect(withDataSpace('/services/data/v68.0/ssot/segments?limit=100&offset=0', 'emea')).toContain('dataspace=emea')
    expect(withDataSpace('/services/data/v68.0/ssot/data-graphs/metadata', 'emea')).toContain('dataspace=emea')
    expect(withDataSpace('/services/data/v68.0/ssot/query-sql/abc/rows?offset=0', 'emea')).toBe('/services/data/v68.0/ssot/query-sql/abc/rows?offset=0')
    expect(withDataSpace('/services/data/v68.0/ssot/data-streams?limit=50', 'emea')).toBe('/services/data/v68.0/ssot/data-streams?limit=50')
    expect(withDataSpace('/services/data/v68.0/ssot/data-model-object-mappings?dataspace=x&dmoDeveloperName=A', 'emea')).toContain('dataspace=x')
    expect(withDataSpace('/services/data/v68.0/ssot/query-sql', null)).toBe('/services/data/v68.0/ssot/query-sql')
  })
})

describe('filtering lists that ignore the parameter', () => {
  it('reads the space from each shape seen live', () => {
    expect(spacesOf({ dataSpaceName: 'default' })).toEqual(['default'])
    expect(spacesOf({ dataSpace: 'emea' })).toEqual(['emea'])
    expect(spacesOf({ dataSpaceInfo: [{ name: 'a' }, { name: 'b' }] })).toEqual(['a', 'b'])
    expect(spacesOf({ dataLakeObjectInfo: { dataSpaceInfo: [{ name: 'emea' }] } })).toEqual(['emea'])
    expect(spacesOf({})).toEqual([])
  })
  it('keeps the selected space and items that do not say', () => {
    const items = [{ dataSpaceName: 'default' }, { dataSpaceName: 'emea' }, { x: 1 }]
    expect(inSpace(items, 'emea')).toEqual([{ dataSpaceName: 'emea' }, { x: 1 }])
    expect(inSpace(items, null)).toHaveLength(3)
  })
  it('filters streams and passes the space to mappings', async () => {
    const call = async (path) => (path.includes('data-streams')
      ? { ok: true, data: { dataStreams: [
          { name: 'A', dataLakeObjectInfo: { name: 'A__dll', dataSpaceInfo: [{ name: 'default' }] } },
          { name: 'B', dataLakeObjectInfo: { name: 'B__dll', dataSpaceInfo: [{ name: 'emea' }] } },
        ] } }
      : { ok: true, data: { objectSourceTargetMaps: [], asked: path } })
    call.dataSpace = 'emea'
    expect((await loadStreams(call, '68.0')).map((s) => s.name)).toEqual(['B'])
    let asked
    await loadMappings(async (p) => { asked = p; return { ok: true, data: {} } }, '68.0', 'X__dlm')
    expect(asked).toContain('dataspace=default')
    const withSpace = async (p) => { asked = p; return { ok: true, data: {} } }
    withSpace.dataSpace = 'emea'
    await loadMappings(withSpace, '68.0', 'X__dlm')
    expect(asked).toContain('dataspace=emea')
  })
})
