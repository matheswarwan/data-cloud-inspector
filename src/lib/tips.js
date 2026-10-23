// Which first-visit tips were seen, and whether tips are on (Settings). Per browser.
const SEEN = 'dci_tipsSeen'
const OFF = 'dci_tipsOff'

export function seenTips() {
  try { const v = JSON.parse(localStorage.getItem(SEEN) || '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}
export function markSeen(ids) {
  try { localStorage.setItem(SEEN, JSON.stringify([...new Set([...seenTips(), ...ids])])) } catch { /* no storage */ }
}
export function resetTips() {
  try { localStorage.removeItem(SEEN) } catch { /* no storage */ }
}
export function tipsOn() {
  try { return localStorage.getItem(OFF) !== '1' } catch { return true }
}
export function setTipsOn(on) {
  try { if (on) localStorage.removeItem(OFF); else localStorage.setItem(OFF, '1') } catch { /* no storage */ }
}
