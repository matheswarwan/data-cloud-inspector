import { createRouter, createWebHashHistory } from 'vue-router'
import ProfileView from '../views/ProfileView.vue'
import SqlView from '../views/SqlView.vue'
import ObjectsView from '../views/ObjectsView.vue'
import SegmentsView from '../views/SegmentsView.vue'
import ConnectionView from '../views/ConnectionView.vue'
import ExploreView from '../views/ExploreView.vue'
import SettingsView from '../views/SettingsView.vue'
import HealthView from '../views/HealthView.vue'
import PersonalizationView from '../views/PersonalizationView.vue'
import CompareView from '../views/CompareView.vue'
import IdentityView from '../views/IdentityView.vue'
import QueryBuilderView from '../views/QueryBuilderView.vue'
import BulkView from '../views/BulkView.vue'
import StreamsView from '../views/StreamsView.vue'
import ActivationsView from '../views/ActivationsView.vue'

export const NAV = [
  { path: '/profile', label: 'Profiles' },
  { path: '/sql', label: 'SQL' },
  { path: '/objects', label: 'Objects' },
  { path: '/identity', label: 'Identity' },
  { path: '/segments', label: 'Segments' },
  { path: '/personalization', label: 'Personalization' },
  { path: '/health', label: 'Health', job: 'health:' },
  { path: '/streams', label: 'Data streams', more: true },
  { path: '/activations', label: 'Activations', more: true },
  { path: '/bulk', label: 'Bulk lookup', job: 'bulk:', more: true },
  { path: '/compare', label: 'Compare', job: 'compare', more: true },
  { path: '/explore', label: 'REST explore', more: true },
  { path: '/connection', label: 'Connection check', more: true },
]

export function createAppRouter() {
  return createRouter({
    history: createWebHashHistory(),
    routes: [
      { path: '/', redirect: '/profile' },
      { path: '/profile/:kind(u|s)?/:id?', component: ProfileView },
      { path: '/sql', component: SqlView },
      { path: '/sql/builder', component: QueryBuilderView },
      { path: '/bulk', component: BulkView },
      { path: '/streams/:name?', component: StreamsView },
      { path: '/activations/:id?', component: ActivationsView },
      { path: '/objects/:name?', component: ObjectsView },
      { path: '/segments/:name?', component: SegmentsView },
      { path: '/explore', component: ExploreView },
      { path: '/connection', component: ConnectionView },
      { path: '/settings', component: SettingsView },
      { path: '/health', component: HealthView },
      { path: '/personalization', component: PersonalizationView },
      { path: '/compare', component: CompareView },
      { path: '/identity/:id?', component: IdentityView },
    ],
  })
}
