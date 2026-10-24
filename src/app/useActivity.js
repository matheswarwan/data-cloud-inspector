// Whether the page is waiting for Salesforce (feedback #119): true once calls have been in
// flight for 300 ms, so quick calls do not flash the progress bar.
import { ref } from 'vue'
import { onActivity } from '../lib/api.js'

const busy = ref(false)
let timer = null
onActivity((n) => {
  if (n > 0) { if (!busy.value && !timer) timer = setTimeout(() => { busy.value = true; timer = null }, 300) }
  else { clearTimeout(timer); timer = null; busy.value = false }
})

export function useActivity() { return busy }
