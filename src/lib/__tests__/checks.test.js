import { runChecks, buildChecks, buildReport } from '../checks.js'
import { latestVersion } from '../api.js'

describe('latestVersion', () => {
  it('picks the highest version numerically', () => {
    expect(latestVersion([{ version: '9.0' }, { version: '65.0' }, { version: '64.0' }])).toBe('65.0')
    expect(latestVersion('nope')).toBeNull()
  })
})

describe('runChecks', () => {
  it('runs every check against the latest version and reports shapes without values', async () => {
    const seen = []
    const call = async (path, opts = {}) => {
      seen.push(`${opts.method || 'GET'} ${path}`)
      if (path === '/services/data/') return { ok: true, status: 200, ms: 5, data: [{ version: '65.0' }] }
      if (path.includes('/query?q=')) return { ok: true, status: 200, ms: 5, data: { records: [{ IsSandbox: true, OrganizationType: 'Developer Edition', InstanceName: 'NA1' }] } }
      if (path.endsWith('/data-model-objects')) return { ok: true, status: 200, ms: 9, data: { dataModelObject: [{ name: 'ssot__Individual__dlm', label: 'Individual' }] } }
      return { ok: false, status: 404, ms: 3, error: 'NOT_FOUND: nope' }
    }
    const { version, results } = await runChecks(call)
    expect(version).toBe('65.0')
    expect(results).toHaveLength(buildChecks('65.0').length + 1)
    expect(seen).toContain('POST /services/data/v65.0/ssot/query-sql')

    const report = buildReport({ extensionVersion: '0.1.0', version, results })
    expect(report).toContain('Developer Edition, sandbox')
    expect(report).toContain('{ dataModelObject: [1 × { name: string, label: string }] }')
    expect(report).toContain('**NOT_FOUND: nope**')
    expect(report).not.toContain('ssot__Individual__dlm')
    expect(report).not.toContain('NA1')
  })

  it('stops after the version lookup when the org is not reachable', async () => {
    const { version, results } = await runChecks(async () => ({ ok: false, status: 0, error: 'No Salesforce session' }))
    expect(version).toBeNull()
    expect(results).toHaveLength(1)
  })
})
