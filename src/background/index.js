// Data Cloud Inspector service worker.
//
// Messages (all `{ type, ... }`):
//   LIST_ORGS                              → { orgs: [{ orgId, host }] }
//   ORG_FOR_URL { url }                    → { org } (null when not a logged-in Salesforce page)
//   SF_FETCH { orgId, path, method, body } → see fetchProxy.js; read only (guard.js)

import { listOrgs, orgForUrl } from './sessions.js'
import { sfFetch } from './fetchProxy.js'
import { createTab } from './chromeAsync.js'

const APP_PAGE = 'app.html'

// The toolbar icon opens the app next to the current tab, on that tab's org when it is
// a Salesforce page.
chrome.action?.onClicked?.addListener(async (tab) => {
  const org = tab?.url ? await orgForUrl(tab.url) : null
  const url = chrome.runtime.getURL(APP_PAGE) + (org ? `?org=${org.orgId}` : '')
  createTab({ url, index: tab ? tab.index + 1 : undefined, openerTabId: tab?.id })
})

const handlers = {
  LIST_ORGS: async () => ({ orgs: await listOrgs() }),
  ORG_FOR_URL: async ({ url }) => ({ org: await orgForUrl(url) }),
  SF_FETCH: (msg) => sfFetch(msg),
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Only the extension's own pages may ask (no content scripts, but be explicit).
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return false
  const handler = handlers[msg?.type]
  if (!handler) return false
  handler(msg).then(sendResponse, (err) => sendResponse({ ok: false, status: 0, error: err.message }))
  return true
})
