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
import InsightsView from '../views/InsightsView.vue'
import DataModelsView from '../views/DataModelsView.vue'

// The sidebar, in the order and groups the user chose (feedback #95); `group` starts a new
// section. Activations is not in that list and sits with Segments.
export const NAV = [
  { path: '/objects', label: 'Objects', icon: 'Boxes', group: 1 },
  { path: '/sql', label: 'SQL', icon: 'Database', group: 1 },
  { path: '/bulk', label: 'Bulk lookup', icon: 'ListChecks', group: 2, job: 'bulk:' },
  { path: '/profile', label: 'Profiles', icon: 'User', group: 2 },
  { path: '/streams', label: 'Data streams', icon: 'ArrowDownToLine', group: 3 },
  { path: '/models', label: 'Data models', icon: 'Network', group: 3 },
  { path: '/identity', label: 'Identity', icon: 'Fingerprint', group: 3 },
  { path: '/segments', label: 'Segments', icon: 'Users', group: 3 },
  { path: '/activations', label: 'Activations', icon: 'Send', group: 3 },
  { path: '/insights', label: 'Insights', icon: 'Calculator', group: 3 },
  { path: '/personalization', label: 'Personalization', icon: 'LayoutTemplate', group: 4 },
  { path: '/compare', label: 'Compare', icon: 'GitCompare', group: 5, job: 'compare' },
  { path: '/explore', label: 'REST explorer', icon: 'Terminal', group: 5 },
  { path: '/health', label: 'Health', icon: 'HeartPulse', group: 5, job: 'health:' },
  { path: '/connection', label: 'Connection check', icon: 'Plug', group: 5 },
]

export function createAppRouter() {
  return createRouter({
    history: createWebHashHistory(),
    routes: [
      { path: '/', redirect: '/objects' },
      { path: '/profile/:kind(u|s)?/:id?', component: ProfileView },
      { path: '/sql', component: SqlView },
      { path: '/sql/builder', component: QueryBuilderView },
      { path: '/bulk', component: BulkView },
      { path: '/streams/:name?', component: StreamsView },
      { path: '/activations/:id?', component: ActivationsView },
      { path: '/insights/:name?', component: InsightsView },
      { path: '/models', component: DataModelsView },
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
