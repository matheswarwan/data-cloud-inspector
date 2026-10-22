// OAuth login for orgs that reject the browser session (API Access Control). The user's own
// External Client App (client ID entered in Settings, callback URL from getRedirectURL()),
// authorization code flow with PKCE through chrome.identity.launchWebAuthFlow. The access
// token is kept in chrome.storage.session (gone when the browser closes) and used in place
// of the sid cookie for that org.

const TOKEN = (orgId) => `dci_oauth_${orgId}`
const CLIENT = (orgId) => `dci_oauthClient_${orgId}`

export function base64url(bytes) {
  let s = ''
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function pkcePair(random = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  const verifier = base64url(random(48))
  const challenge = base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  return { verifier, challenge }
}

export function authorizeUrl({ host, clientId, redirectUri, challenge, state }) {
  const q = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri, code_challenge: challenge, code_challenge_method: 'S256', state })
  return `https://${host}/services/oauth2/authorize?${q}`
}

/** The code from the redirect, after checking the state; throws Salesforce's error otherwise. */
export function codeFromRedirect(url, state) {
  const u = new URL(url)
  const p = new URLSearchParams(u.search || u.hash.slice(1))
  if (p.get('error')) throw new Error(`${p.get('error')}: ${p.get('error_description') || ''}`.trim())
  if (p.get('state') !== state) throw new Error('The login answer did not match this request; try again.')
  const code = p.get('code')
  if (!code) throw new Error('Salesforce did not return an authorization code.')
  return code
}

/** The 15-character org ID in a token response's identity URL (…/id/<orgId>/<userId>). */
export function orgIdOfToken(token) {
  const m = String(token?.id || '').match(/\/id\/(00D[a-zA-Z0-9]{12,15})\//)
  return m ? m[1].slice(0, 15) : null
}

function sessionGet(key) {
  return new Promise((resolve) => { try { chrome.storage.session.get(key, (r) => resolve(r?.[key] || null)) } catch { resolve(null) } })
}
function sessionSet(items) {
  return new Promise((resolve) => { try { chrome.storage.session.set(items, () => resolve()) } catch { resolve() } })
}
function sessionRemove(key) {
  return new Promise((resolve) => { try { chrome.storage.session.remove(key, () => resolve()) } catch { resolve() } })
}
function localGet(key) {
  return new Promise((resolve) => { try { chrome.storage.local.get(key, (r) => resolve(r?.[key] || '')) } catch { resolve('') } })
}
function localSet(items) {
  return new Promise((resolve) => { try { chrome.storage.local.set(items, () => resolve()) } catch { resolve() } })
}

export function redirectUri() {
  try { return chrome.identity.getRedirectURL() } catch { return '' }
}

export async function oauthStatus(orgId) {
  const t = await sessionGet(TOKEN(orgId))
  return { active: !!t, since: t?.at || null, clientId: await localGet(CLIENT(orgId)), redirectUri: redirectUri() }
}

/** `{ host, sid }` from a stored OAuth token, or null. */
export async function oauthSession(orgId) {
  const t = await sessionGet(TOKEN(orgId))
  return t ? { host: t.host, sid: t.accessToken, oauth: true } : null
}

export async function forgetToken(orgId) {
  await sessionRemove(TOKEN(orgId))
}

export async function oauthLogin({ orgId, host, clientId }, deps = {}) {
  const launch = deps.launchWebAuthFlow || ((opts) => chrome.identity.launchWebAuthFlow(opts))
  const fetchFn = deps.fetch || fetch
  const redirect = deps.redirectUri || redirectUri()
  if (!clientId?.trim()) throw new Error('Enter the client ID of your External Client App first.')
  await localSet({ [CLIENT(orgId)]: clientId.trim() })
  const { verifier, challenge } = await pkcePair()
  const state = base64url(crypto.getRandomValues(new Uint8Array(16)))
  const answer = await launch({ url: authorizeUrl({ host, clientId: clientId.trim(), redirectUri: redirect, challenge, state }), interactive: true })
  if (!answer) throw new Error('The login window was closed.')
  const code = codeFromRedirect(answer, state)
  const res = await fetchFn(`https://${host}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: clientId.trim(), redirect_uri: redirect, code_verifier: verifier }).toString(),
    credentials: 'omit',
  })
  const token = await res.json().catch(() => ({}))
  if (!res.ok || !token.access_token) throw new Error(token.error_description || token.error || `Token request failed (HTTP ${res.status})`)
  const tokenOrg = orgIdOfToken(token)
  if (tokenOrg && tokenOrg !== orgId) throw new Error(`You logged in to a different org (${tokenOrg}). Log in to ${host}.`)
  const instance = token.instance_url ? new URL(token.instance_url).host : host
  await sessionSet({ [TOKEN(orgId)]: { accessToken: token.access_token, host: instance, at: new Date().toISOString(), scope: token.scope || '' } })
  return { ok: true, scope: token.scope || '' }
}
