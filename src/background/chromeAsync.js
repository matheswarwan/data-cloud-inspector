// Promise wrappers around the callback-style chrome APIs. They resolve (never reject),
// so a missing API in a test degrades to "nothing found".

export function getCookie(details) {
  return new Promise((resolve) => {
    try { chrome.cookies.get(details, (c) => resolve(c || null)) } catch { resolve(null) }
  })
}

export function getAllCookies(details) {
  return new Promise((resolve) => {
    try { chrome.cookies.getAll(details, (c) => resolve(c || [])) } catch { resolve([]) }
  })
}

export function createTab(props) {
  return new Promise((resolve) => {
    try { chrome.tabs.create(props, (t) => resolve(t || null)) } catch { resolve(null) }
  })
}
