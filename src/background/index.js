// Data Cloud Inspector service worker.
//
// Messages (all `{ type, ... }`):
//   LIST_ORGS                              → { orgs: [{ orgId, host }] }
//   ORG_FOR_URL { url }                    → { org } (null when not a logged-in Salesforce page)
//   SF_FETCH { orgId, path, method, body } → see fetchProxy.js; read only (guard.js)
//   OAUTH_STATUS { orgId }, OAUTH_LOGIN { orgId?, host?, clientId }, OAUTH_LOGOUT { orgId }   (oauth.js)
//   OAUTH_LOGIN with `host` and no `orgId` logs in to an org without a browser session
//   (administrator policy authMode 'oauth-only').

import { listOrgs, orgForUrl } from './sessions.js'
import { sfFetch } from './fetchProxy.js'
import { createTab } from './chromeAsync.js'
import { oauthStatus, oauthLogin, forgetToken } from './oauth.js'

const APP_PAGE = 'app.html'

// The toolbar icon opens the app next to the current tab, on that tab's org when it is
// a Salesforce page.
chrome.action?.onClicked?.addListener(async (tab) => {
  const org = tab?.url ? await orgForUrl(tab.url) : null
  const url = chrome.runtime.getURL(APP_PAGE) + (org ? `?org=${org.orgId}` : '')
  createTab({ url, index: tab ? tab.index + 1 : undefined, openerTabId: tab?.id })
})

// Job results that hold people's data (Bulk lookup, Compare) were kept in chrome.storage.local
// up to 1.0.7. They now live in session storage only; remove the old copies.
chrome.runtime?.onInstalled?.addListener(() => {
  chrome.storage.local.get(null, (all) => {
    const old = Object.keys(all || {}).filter((k) => k.startsWith('dci_job_') && !k.startsWith('dci_job_health'))
    if (old.length) chrome.storage.local.remove(old)
  })
})

const handlers = {
  LIST_ORGS: async () => ({ orgs: await listOrgs() }),
  ORG_FOR_URL: async ({ url }) => ({ org: await orgForUrl(url) }),
  SF_FETCH: (msg) => sfFetch(msg),
  OAUTH_STATUS: ({ orgId }) => oauthStatus(orgId),
  OAUTH_LOGIN: async ({ orgId, host, clientId }) => {
    let target = { orgId: null, host }
    if (orgId) {
      const org = (await listOrgs()).find((o) => o.orgId === orgId)
      if (!org) return { ok: false, error: 'That org is not logged in in this browser.' }
      target = org
    }
    try { return await oauthLogin({ orgId: target.orgId, host: target.host, clientId }) } catch (err) { return { ok: false, error: err.message } }
  },
  OAUTH_LOGOUT: async ({ orgId }) => { await forgetToken(orgId, { revoke: true }); return { ok: true } },
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Only the extension's own pages may ask (no content scripts, but be explicit).
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return false
  const handler = handlers[msg?.type]
  if (!handler) return false
  handler(msg).then(sendResponse, (err) => sendResponse({ ok: false, status: 0, error: err.message }))
  return true
})
