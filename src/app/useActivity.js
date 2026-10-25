// Whether the page is waiting for Salesforce (feedback #119): true once calls have been in
// flight for 300 ms, so quick calls do not flash the progress bar. `text` says what is
// loading (feedback #143), from the calls' paths and the running jobs.
import { ref } from 'vue'
import { onActivity } from '../lib/api.js'
import { loadingText } from '../lib/loadingText.js'

const busy = ref(false)
const text = ref('')
let timer = null
onActivity((n, paths = [], tasks = []) => {
  text.value = loadingText(paths, tasks)
  if (n > 0 || tasks.length) { if (!busy.value && !timer) timer = setTimeout(() => { busy.value = true; timer = null }, 300) }
  else { clearTimeout(timer); timer = null; busy.value = false }
})

export function useActivity() { return busy }
export function useActivityText() { return text }
