// Who the extension acts as (feedback #84): the logged-in user, their profile and role, and
// the permission sets that matter for Data Cloud. Everything the extension can see comes from
// this user's own access.

const DATA_CLOUD_SET = /data ?cloud|data ?360|\bcdp\b|customer data|genie|personali[sz]ation|segment|identity|activation|calculated insight|unified/i

function soql(version, query) {
  return `/services/data/v${version}/query?q=${encodeURIComponent(query)}`
}

/** `{ id, name, username, email, profile, role, userType, timeZone, permissionSets, dataCloudSets }` */
export async function loadUserContext(call, version) {
  const me = await call(`/services/data/v${version}/chatter/users/me`)
  if (!me.ok) throw new Error(me.error || `HTTP ${me.status}`)
  const id = me.data?.id
  const [user, sets, org] = await Promise.all([
    call(soql(version, `SELECT Name, Username, Email, Profile.Name, UserRole.Name, UserType, TimeZoneSidKey FROM User WHERE Id = '${id}'`)),
    call(soql(version, `SELECT PermissionSet.Name, PermissionSet.Label FROM PermissionSetAssignment WHERE AssigneeId = '${id}' AND PermissionSet.IsOwnedByProfile = false ORDER BY PermissionSet.Label`)),
    call(soql(version, 'SELECT Id, Name, OrganizationType, IsSandbox, InstanceName FROM Organization')),
  ])
  const u = user.ok ? user.data?.records?.[0] || {} : {}
  const permissionSets = sets.ok ? (sets.data?.records || []).map((r) => r.PermissionSet?.Label || r.PermissionSet?.Name).filter(Boolean) : []
  const o = org.ok ? org.data?.records?.[0] || {} : {}
  return {
    id,
    name: u.Name || me.data?.name || '',
    username: u.Username || me.data?.username || '',
    email: u.Email || me.data?.email || '',
    profile: u.Profile?.Name || '',
    role: u.UserRole?.Name || '',
    userType: u.UserType || me.data?.userType || '',
    timeZone: u.TimeZoneSidKey || '',
    permissionSets,
    dataCloudSets: permissionSets.filter((p) => DATA_CLOUD_SET.test(p)),
    org: { id: o.Id || '', name: o.Name || '', type: o.OrganizationType || '', sandbox: !!o.IsSandbox, instance: o.InstanceName || '' },
  }
}
