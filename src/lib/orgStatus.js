// What to tell the user when the org cannot be used: the browser session was rejected, or
// Data Cloud is not there for this user. Kept apart from the UI so it can be tested.

const SESSION_CODES = /INVALID_SESSION_ID|API_DISABLED|API_CURRENTLY_DISABLED|INVALID_AUTH|Session expired/i

/** From the chatter/users/me call: null when the session works, else `{ kind, message }`. */
export function sessionProblem(res) {
  if (res?.ok) return null
  if (res?.code === 'NO_SESSION') return { kind: 'logged-out', message: 'There is no Salesforce session for this org in this browser. Log in to the org, then choose Find orgs again in the connection menu.' }
  if (res?.status === 401 || res?.status === 403 || SESSION_CODES.test(res?.error || '')) {
    return {
      kind: 'rejected',
      message: `Salesforce rejected the browser session (${(res.error || `HTTP ${res.status}`).split('\n')[0]}). Log in to the org again in this browser. If that does not help, the org may block API calls from browser sessions (API Access Control): use Settings, Log in with OAuth.`,
    }
  }
  return null
}

/** From GET ssot/data-spaces: null when Data Cloud answers, else `{ kind, message }`. */
export function dataCloudProblem(res) {
  if (res?.ok) return null
  if (res?.status === 404) return { kind: 'no-data-cloud', message: 'Data Cloud does not answer in this org: it may not be provisioned here. Profiles, Segments, SQL, Objects and Health need Data Cloud.' }
  if (res?.status === 403) return { kind: 'no-access', message: `This user cannot use Data Cloud in this org (${(res.error || 'forbidden').split('\n')[0]}). Ask an admin for a Data Cloud permission set.` }
  return null
}
