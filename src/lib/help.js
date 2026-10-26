// Help text for the whole tool (feedback #103): one entry per page or feature, used by the
// help icons (HelpTip), the Help page and the tips shown on a page's first visit.

/** `{ id: { title, page, text } }`; `page` is the route to open it, `text` one or two plain sentences. */
export const HELP = {
  objects: { title: 'Objects', page: '/objects', text: 'Every data lake object (DLO), data model object (DMO) and calculated insight in the selected data space, with fields, keys and relationships. For a DMO, Mapped from shows what feeds it; Used by shows the calculated insights, segments and activations that depend on it.' },
  sql: { title: 'SQL', page: '/sql', text: 'Run Data Cloud SQL against DLOs, DMOs and calculated insights. Each tab has its own query and results; Ctrl or Cmd+Enter runs the query (or only the selected text).' },
  'sql-objects': { title: 'Objects panel', page: '/sql', text: 'Search the objects beside the editor. Click an object or field to insert it where the cursor is, or tick fields and insert a SELECT of them.' },
  'sql-results': { title: 'Results', page: '/sql', text: 'Sort by any column, filter per column with the funnel icon, click a cell for its full value. Download CSV fetches every row, not only the ones loaded.' },
  builder: { title: 'Query builder', page: '/sql/builder', text: 'Build a query without writing SQL: click objects on the left to add them; each joins an earlier one (the join is suggested from your org\'s relationships, or pick the fields, with as many conditions as you need). Then pick the output fields, add filters and options, and run it, count the rows or open it in a SQL tab. List or Visual shows the same query.' },
  bulk: { title: 'Bulk lookup', page: '/bulk', text: 'Paste up to 1,000 emails, phones or IDs and see for each one whether it was found, its unified profile and, if you pick a segment, whether it is a member and matches the criteria now. It runs in the background, so you can leave the page.' },
  profile: { title: 'Profiles', page: '/profile', text: 'Look up a person by email, phone, name or ID and pick an identity resolution ruleset. You see the unified record, every source record behind it, the match rules side by side with the values, and everything related to the person.' },
  'profile-missed': { title: 'Possible missed matches', page: '/profile', text: 'People who share an email with this profile but were not unified with it. This is where a match rule that is too strict shows up.' },
  'profile-rules': { title: 'Match rules', page: '/profile', text: "The ruleset's match rules with each source record's values, and which pairs of records satisfy them. Fuzzy matches are approximated." },
  streams: { title: 'Data streams', page: '/streams', text: 'Every data stream with its source, schedule, record counts and problem records, the DMOs it maps into, and its source fields with the DLO field each lands in.' },
  models: { title: 'Data models', page: '/models', text: 'The DMOs with something mapped into them, or all of them, with where their data comes from and what uses them. Switch to Diagram to see the relationships; download as Markdown, Word, PDF, HTML or Excel.' },
  'models-diagram': { title: 'Data model diagram', page: '/models?view=diagram', text: 'Drag the background to pan, the wheel to zoom, drag a box to move it, click a box to see its connections. Export as SVG, PNG, Mermaid, draw.io or Graphviz.' },
  identity: { title: 'Identity', page: '/identity', text: 'Every identity resolution ruleset with its match and reconciliation rules in plain words, its consolidation rate, and the largest unified profiles, where wrong merges usually hide.' },
  'identity-compare': { title: 'Compare people', page: '/identity', text: 'Pick two or more source records (up to 10) and see, criterion by criterion, which of them this ruleset would join, and how that compares with the unified profiles they are in now.' },
  graphs: { title: 'Data graphs', page: '/graphs', text: "Each data graph with its objects, fields and joins, as a diagram, as SQL, and one record's graph fetched by ID the way Personalization and Agentforce read it." },
  segments: { title: 'Segments', page: '/segments', text: 'Every segment with its criteria in plain words and as SQL, its counts at the last publish, in the membership table and matching the criteria now, and its publish history.' },
  'segment-check': { title: 'Is this person in the segment?', page: '/segments', text: 'Type a name, email or ID to see whether that person is in the segment, since when, and if not, which condition keeps them out.' },
  'segment-counts': { title: 'Counts', page: '/segments', text: 'Three numbers that should agree: the count at the last publish, the rows in the membership table now, and the people matching the criteria now (Count now). When they differ, the segment needs a publish or the data changed.' },
  activations: { title: 'Activations', page: '/activations', text: 'Every activation with its segment, target, the attributes it sends with their output names, its contact points, filters and the latest audience with row counts.' },
  insights: { title: 'Calculated insights', page: '/insights', text: 'Calculated insights as Data Cloud lists them, and for each one its SQL, dimensions and measures, a preview of its data and what it reads.' },
  personalization: { title: 'Personalization', page: '/personalization', text: 'Personalization points with their decisions in priority order, recommenders, experiments, content schemas and objectives, and what the personalization log recorded.' },
  compare: { title: 'Compare', page: '/compare', text: 'Compare two orgs, for example a sandbox and production: objects, fields, segments, calculated insights and data streams that differ. It runs in the background.' },
  credits: { title: 'Credit prediction', page: '/credits', text: 'Data Cloud credits used, per card or usage type, and a forecast from the recent daily use, read from the org\'s consumption objects (TenantDailyEntitlementConsumption and others) with SQL, split by environment (Production, Sandbox, Scratch) and by the org that used them. The objects exist only in production but include the sandboxes\' usage. Without them, the page says how to turn them on (Digital Wallet, then add them to a data space). The Digital Wallet in Setup is the record.' },
  explore: { title: 'REST explorer', page: '/explore', text: 'Send a GET to any Data Cloud or Salesforce API path and see the response, with ready-made examples. Only reads are allowed.' },
  health: { title: 'Health', page: '/health', text: 'Data streams, identity resolution, calculated insights, segments and activations on one page, problems first, with the reason each one needs a look.' },
  connection: { title: 'Connection check', page: '/connection', text: 'Which Data Cloud APIs your org answers with your session, who the tool acts as, and the other orgs you connected to before. Copy report shares statuses and response shapes, never data values.' },
  settings: { title: 'Settings', page: '/settings', text: 'Theme, tips, the OAuth login for orgs that block browser sessions, and what the extension stores, with sizes and a delete for each part.' },
  search: { title: 'Search (Ctrl+K)', page: '', text: 'Ctrl or Cmd+K searches pages, objects, fields, segments and saved queries, or finds a person.' },
  'read-only': { title: 'Read only', page: '', text: 'The tool never changes data or setup. It sends reads only (and Data Cloud SQL queries, which also only read). Your Salesforce session stays in the extension and goes only to your own org.' },
}

/** Help topics in the order the Help page lists them, by group. */
export const HELP_GROUPS = [
  { title: 'Getting started', ids: ['read-only', 'search', 'connection', 'settings'] },
  { title: 'Explore the data', ids: ['objects', 'sql', 'sql-objects', 'sql-results', 'builder'] },
  { title: 'People', ids: ['bulk', 'profile', 'profile-rules', 'profile-missed'] },
  { title: 'Data model and identity', ids: ['streams', 'models', 'models-diagram', 'identity', 'identity-compare', 'graphs'] },
  { title: 'Segments and activation', ids: ['segments', 'segment-counts', 'segment-check', 'activations', 'insights'] },
  { title: 'Personalization and checks', ids: ['personalization', 'explore', 'credits', 'compare', 'health'] },
]

/**
 * Tips shown once when a page is first opened: features people miss. `selector` points at the
 * part of the page to highlight (`[data-help="<id>"]`), when it is on the page.
 */
export const PAGE_TIPS = {
  '/segments': ['segment-check', 'segment-counts'],
  '/profile': ['profile-rules', 'profile-missed'],
  '/identity': ['identity-compare'],
  '/models': ['models-diagram'],
  '/sql': ['sql-objects', 'sql-results'],
  '/bulk': ['bulk'],
  '/graphs': ['graphs'],
  '/sql/builder': ['builder'],
}

/** The page a route belongs to for tips: the longest PAGE_TIPS key the path starts with. */
export function tipPage(path) {
  const keys = Object.keys(PAGE_TIPS).filter((k) => path === k || path.startsWith(`${k}/`))
  return keys.sort((a, b) => b.length - a.length)[0] || ''
}

/** The tips of a page not yet seen. */
export function unseenTips(path, seen) {
  return (PAGE_TIPS[tipPage(path)] || []).filter((id) => !seen.includes(id) && HELP[id])
}
