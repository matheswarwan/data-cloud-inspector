// Lets any page open the Ctrl/Cmd+K search (CommandPalette in App.vue), optionally with text
// already typed (Home's search box).
let opener = null
export function registerPalette(fn) { opener = fn }
export function openPalette(text = '') { opener?.(text) }
