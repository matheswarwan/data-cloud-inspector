import { loadUserContext } from '../userContext.js'

describe('loadUserContext', () => {
  it('reads the user, their permission sets and the org', async () => {
    const call = async (path) => {
      if (path.endsWith('/chatter/users/me')) return { ok: true, data: { id: '005A', name: 'Ann', username: 'ann@x' } }
      const q = decodeURIComponent(path.split('q=')[1])
      if (q.includes('FROM User ')) return { ok: true, data: { records: [{ Name: 'Ann Lee', Username: 'ann@x.org', Profile: { Name: 'System Administrator' }, UserRole: null, UserType: 'Standard' }] } }
      if (q.includes('PermissionSetAssignment')) {
        expect(q).toContain("AssigneeId = '005A'")
        return { ok: true, data: { records: [{ PermissionSet: { Label: 'Data Cloud Admin' } }, { PermissionSet: { Label: 'Maps - Base Access' } }, { PermissionSet: { Label: 'CDP Marketing' } }] } }
      }
      return { ok: true, data: { records: [{ Id: '00D1', OrganizationType: 'Enterprise Edition', IsSandbox: false }] } }
    }
    const c = await loadUserContext(call, '68.0')
    expect(c).toMatchObject({ id: '005A', name: 'Ann Lee', username: 'ann@x.org', profile: 'System Administrator', role: '', userType: 'Standard' })
    expect(c.dataCloudSets).toEqual(['Data Cloud Admin', 'CDP Marketing'])
    expect(c.permissionSets).toHaveLength(3)
    expect(c.org).toMatchObject({ id: '00D1', type: 'Enterprise Edition', sandbox: false })
  })
  it('fails when the user cannot be read', async () => {
    await expect(loadUserContext(async () => ({ ok: false, status: 401, error: 'INVALID_SESSION_ID' }), '68.0')).rejects.toThrow('INVALID_SESSION_ID')
  })
})
