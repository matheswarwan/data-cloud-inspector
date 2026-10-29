import { reactive } from 'vue'
import { isOn } from '../lib/features.js'
import { pageListed } from '../lib/optionalPages.js'
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
import FlowsView from '../views/FlowsView.vue'
import CampaignsView from '../views/CampaignsView.vue'
import CompareView from '../views/CompareView.vue'
import DataGraphsView from '../views/DataGraphsView.vue'
import HelpView from '../views/HelpView.vue'
import HomeView from '../views/HomeView.vue'
import IdentityView from '../views/IdentityView.vue'
import QueryBuilderView from '../views/QueryBuilderView.vue'
import BulkView from '../views/BulkView.vue'
import StreamsView from '../views/StreamsView.vue'
import ActivationsView from '../views/ActivationsView.vue'
import InsightsView from '../views/InsightsView.vue'
import DataModelsView from '../views/DataModelsView.vue'
import CreditsView from '../views/CreditsView.vue'
import TargetsView from '../views/TargetsView.vue'

// The sidebar, in the order and groups the user chose (feedback #95); `group` starts a new
// section. Activations is not in that list and sits with Segments. Last group reordered and
// Credit prediction added (feedback #145).
// Every page; NAV is the ones switched on (src/features.json, feedback #1020).
export const ALL_NAV = [
  { path: '/', label: 'Home', icon: 'Home', group: 0 },
  { path: '/objects', label: 'Objects', icon: 'Boxes', group: 1, feature: 'objects' },
  { path: '/sql', label: 'SQL', icon: 'Database', group: 1, feature: 'sql' },
  { path: '/sql/builder', label: 'Query builder', icon: 'Blocks', group: 1, feature: 'queryBuilder' },
  // People (feedback #1056): one sidebar entry; Bulk lookup is its "A list" tab at /bulk.
  { path: '/profile', label: 'People', icon: 'User', group: 2, job: 'bulk:', feature: 'profiles', also: ['/bulk'] },
  { path: '/bulk', label: 'Bulk lookup', icon: 'ListChecks', group: 2, feature: 'bulk', tab: true },
  { path: '/streams', label: 'Data streams', icon: 'ArrowDownToLine', group: 3, feature: 'streams' },
  { path: '/models', label: 'Data models', icon: 'Network', group: 3, feature: 'models' },
  { path: '/identity', label: 'Identity', icon: 'Fingerprint', group: 3, feature: 'identity' },
  { path: '/graphs', label: 'Data graphs', icon: 'Share2', group: 3, feature: 'dataGraphs' },
  { path: '/segments', label: 'Segments', icon: 'Users', group: 3, feature: 'segments' },
  { path: '/activations', label: 'Activations', icon: 'Send', group: 3, feature: 'activations' },
  // Data targets (feedback #1064): where activations send, next to Activations.
  { path: '/targets', label: 'Data targets', icon: 'Target', group: 3, feature: 'targets' },
  { path: '/insights', label: 'Insights', icon: 'Calculator', group: 3, feature: 'insights' },
  { path: '/personalization', label: 'Personalization', icon: 'LayoutTemplate', group: 4, feature: 'personalization' },
  { path: '/flows', label: 'Marketing flows', icon: 'Workflow', group: 4, feature: 'marketingFlows' },
  { path: '/campaigns', label: 'Campaigns', icon: 'Megaphone', group: 4, feature: 'campaigns' },
  { path: '/explore', label: 'REST explorer', icon: 'Terminal', group: 5, feature: 'restExplorer' },
  { path: '/credits', label: 'Credit prediction', icon: 'Gauge', group: 5, feature: 'credits' },
  { path: '/compare', label: 'Compare', icon: 'GitCompare', group: 5, job: 'compare', feature: 'compare' },
  { path: '/health', label: 'Health', icon: 'HeartPulse', group: 5, job: 'health:', feature: 'health' },
  { path: '/connection', label: 'Connection check', icon: 'Plug', group: 5, feature: 'connection' },
]
// Reactive, so turning an optional page on or off in Settings updates the sidebar, Home and
// search at once (feedback #1041).
export const NAV = reactive([])
export function refreshNav() {
  NAV.splice(0, NAV.length, ...ALL_NAV.filter((n) => !n.tab && isOn(n.feature) && pageListed(n.feature)))
}
refreshNav()

export function createAppRouter() {
  const router = createRouter({
    history: createWebHashHistory(),
    routes: [
      { path: '/', component: HomeView },
      { path: '/profile/:kind(u|s)?/:id?', component: ProfileView },
      { path: '/sql', component: SqlView },
      { path: '/sql/builder', component: QueryBuilderView },
      { path: '/bulk', component: BulkView },
      { path: '/streams/:name?', component: StreamsView },
      { path: '/activations/:id?', component: ActivationsView },
      { path: '/targets/:id?', component: TargetsView },
      { path: '/insights/:name?', component: InsightsView },
      { path: '/models', component: DataModelsView },
      { path: '/objects/:name?', component: ObjectsView },
      { path: '/segments/:name?', component: SegmentsView },
      { path: '/explore', component: ExploreView },
      { path: '/connection', component: ConnectionView },
      { path: '/settings', component: SettingsView },
      { path: '/health', component: HealthView },
      { path: '/personalization', component: PersonalizationView },
      { path: '/flows', component: FlowsView },
      { path: '/campaigns', component: CampaignsView },
      { path: '/compare', component: CompareView },
      { path: '/credits', component: CreditsView },
      { path: '/identity/:id?', component: IdentityView },
      { path: '/graphs/:name?', component: DataGraphsView },
      { path: '/help', component: HelpView },
    ],
  })
  // A page switched off goes to Home: the closest page a path belongs to decides.
  router.beforeEach((to) => {
    const page = ALL_NAV.filter((n) => n.path !== '/' && (to.path === n.path || to.path.startsWith(`${n.path}/`)))
      .sort((x, y) => y.path.length - x.path.length)[0]
    return page && !isOn(page.feature) ? '/' : true
  })
  return router
}
