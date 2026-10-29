// Pages hidden from the sidebar, Home and search until turned on in Settings (feedback #1041):
// the Marketing Cloud pages most Data Cloud users do not need. Their addresses still open, so
// links from other pages keep working. Kept in this browser. The same switches hide those
// products elsewhere: their Health sections and the Marketing Cloud Next panels on Profiles.

export const OPTIONAL_PAGES = ['personalization', 'marketingFlows', 'campaigns']
const KEY = 'dci_pages_shown'

/** Optional pages turned on in Settings. */
export function shownPages() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(v) ? v.filter((f) => OPTIONAL_PAGES.includes(f)) : []
  } catch { return [] }
}

/** Whether a page (by its feature key) is listed: every page but the optional ones not turned on. */
export const pageListed = (feature, shown = shownPages()) => !OPTIONAL_PAGES.includes(feature) || shown.includes(feature)

export function setPageShown(feature, on) {
  const next = new Set(shownPages())
  if (on) next.add(feature)
  else next.delete(feature)
  try { localStorage.setItem(KEY, JSON.stringify([...next])) } catch { /* private window */ }
}

// Health sections that belong to an optional page.
const HEALTH_SECTIONS = { 'Personalization recommenders': 'personalization', 'Marketing flows': 'marketingFlows' }

/** Whether a Health section shows: those of an optional page only when it is turned on. */
export const healthSectionListed = (title, shown = shownPages()) => !HEALTH_SECTIONS[title] || pageListed(HEALTH_SECTIONS[title], shown)

/** Marketing Cloud Next panels on Profiles (consent, message history by channel). */
export const mcnListed = (shown = shownPages()) => pageListed('marketingFlows', shown) || pageListed('campaigns', shown)
