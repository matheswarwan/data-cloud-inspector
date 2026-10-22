import '../assets/base.css'
import '../assets/tailwind.css'

import { createApp } from 'vue'
import App from './App.vue'
import { createAppRouter } from './router.js'

import './useSettings.js' // applies the theme

createApp(App).use(createAppRouter()).mount('#app')
