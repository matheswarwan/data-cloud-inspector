import { createRouter, createWebHashHistory } from 'vue-router'
import SqlView from '../views/SqlView.vue'
import ObjectsView from '../views/ObjectsView.vue'
import ConnectionView from '../views/ConnectionView.vue'
import ExploreView from '../views/ExploreView.vue'

export const NAV = [
  { path: '/sql', label: 'SQL' },
  { path: '/objects', label: 'Objects' },
  { path: '/explore', label: 'REST explore' },
  { path: '/connection', label: 'Connection check' },
]

export function createAppRouter() {
  return createRouter({
    history: createWebHashHistory(),
    routes: [
      { path: '/', redirect: '/sql' },
      { path: '/sql', component: SqlView },
      { path: '/objects/:name?', component: ObjectsView },
      { path: '/explore', component: ExploreView },
      { path: '/connection', component: ConnectionView },
    ],
  })
}
