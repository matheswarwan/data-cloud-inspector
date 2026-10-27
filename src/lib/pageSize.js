// Rows per page for every table (feedback #1015, like Contact Builder's data extension
// view): one choice for the whole tool, remembered in this browser.
import { ref, watch } from 'vue'

export const PAGE_SIZES = [10, 20, 50, 100, 200]
const KEY = 'dci_pageSize'
const read = () => { try { const n = Number(localStorage.getItem(KEY)); return PAGE_SIZES.includes(n) ? n : 50 } catch { return 50 } }
export const pageSize = ref(read())
watch(pageSize, (n) => { try { localStorage.setItem(KEY, String(n)) } catch { /* private window */ } })

/** Page `page` (0-based) of `rows`, and the page count. */
export function pageOf(rows, page, size) {
  const pages = Math.max(1, Math.ceil(rows.length / size))
  const p = Math.min(Math.max(0, page), pages - 1)
  return { rows: rows.slice(p * size, (p + 1) * size), page: p, pages, from: rows.length ? p * size + 1 : 0, to: Math.min(rows.length, (p + 1) * size) }
}
