import '../assets/base.css'
import '../assets/tailwind.css'

import { createApp } from 'vue'
import App from './App.vue'
import { createAppRouter } from './router.js'

import './useSettings.js' // applies the theme
import { loadPolicy } from '../lib/policy.js'
import { vExpand } from '../lib/expandCard.js'

// The administrator policy (chrome.storage.managed) is read before anything loads.
loadPolicy().finally(() => createApp(App).use(createAppRouter()).directive('expand', vExpand).mount('#app'))
