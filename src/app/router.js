import { createRouter, createWebHashHistory } from 'vue-router'
import ConnectionView from '../views/ConnectionView.vue'
import ExploreView from '../views/ExploreView.vue'

export const NAV = [
  { path: '/connection', label: 'Connection check' },
  { path: '/explore', label: 'REST explore' },
]

export function createAppRouter() {
  return createRouter({
    history: createWebHashHistory(),
    routes: [
      { path: '/', redirect: '/connection' },
      { path: '/connection', component: ConnectionView },
      { path: '/explore', component: ExploreView },
    ],
  })
}
