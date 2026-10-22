import '../assets/base.css'
import '../assets/tailwind.css'

import { createApp } from 'vue'
import App from './App.vue'
import { createAppRouter } from './router.js'

// Follow the system theme.
const dark = window.matchMedia?.('(prefers-color-scheme: dark)')
const applyTheme = () => document.documentElement.classList.toggle('dark', !!dark?.matches)
applyTheme()
dark?.addEventListener?.('change', applyTheme)

createApp(App).use(createAppRouter()).mount('#app')
