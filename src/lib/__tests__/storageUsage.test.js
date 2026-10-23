import { groupStorage, formatBytes } from '../storageUsage.js'

describe('storage usage', () => {
  const entries = [
    { area: 'local', key: 'dci_catalog_00DjV000006UTXN', bytes: 340000 },
    { area: 'local', key: 'dci_catalog_00D5g000004XyZQ_emea', bytes: 120000 },
    { area: 'local', key: 'dci_savedQueries', bytes: 900 },
    { area: 'local', key: 'dci_history', bytes: 5000 },
    { area: 'session', key: 'dci_s_00DjV000006UTXN_default_usage', bytes: 4000 },
    { area: 'session', key: 'dci_oauth_00DjV000006UTXN', bytes: 300 },
    { area: 'page', key: 'dci_theme', bytes: 30 },
  ]
  it('groups keys by purpose and by org', () => {
    const g = groupStorage(entries)
    expect(g.map((x) => x.id)).toEqual(['metadata', 'saved', 'history', 'session', 'oauthTokens', 'page'])
    const meta = g.find((x) => x.id === 'metadata')
    expect(meta.bytes).toBe(460000)
    expect(meta.byOrg.map((o) => o.orgId)).toEqual(['00DjV000006UTXN', '00D5g000004XyZQ'])
    expect(g.find((x) => x.id === 'session').keys).toEqual(['dci_s_00DjV000006UTXN_default_usage'])
    expect(g.find((x) => x.id === 'oauthTokens').keys).toEqual(['dci_oauth_00DjV000006UTXN'])
  })
  it('formats sizes', () => {
    expect(formatBytes(900)).toBe('900 B')
    expect(formatBytes(5000)).toBe('4.9 KB')
    expect(formatBytes(340000)).toBe('332 KB')
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB')
  })
})
