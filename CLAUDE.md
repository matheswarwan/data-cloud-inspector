# Data Cloud Inspector: dev notes

Read-only Chrome extension for Salesforce Data Cloud. Vue 3 + Vite + Tailwind 4, same
stack and conventions as `../sfmc-toolkit`. Plan and status log: `../data-cloud-inspector-plan.md`.

## Layout

- `src/background/`: service worker. `orgs.js` (sid cookies to orgs, my-domain rewrite),
  `sessions.js` (cookie reads, fresh per call), `guard.js` (read-only rule),
  `fetchProxy.js` (Bearer sid, `Sforce-Call-Options: client=DataCloudInspector`, no cookies sent).
- `src/lib/`: page-side helpers. `api.js` (SF_FETCH), `shape.js` (response shapes without
  values), `checks.js` (connection check and its shareable report), `catalog.js` (GET
  `/ssot/metadata?entityType=` DataLakeObject, DataModelObject, CalculatedInsight),
  `lineage.js` (data streams, `data-model-object-mappings?dmoDeveloperName=`), `pages.js`
  (follow `nextPageUrl` as given), `query.js` (query-sql run, poll, rows paging, CSV, Markdown),
  `profile.js` (rulesets, search, profile, related objects through relationships, match
  explanation with an approximate fuzzy check, missed matches, Markdown).
- `src/app/useCatalog.js`: metadata cached per org in chrome.storage.local until Refresh.
- Query builder layout (feedback #124): `lib/builderLayout.js` (sizes and step heights in
  `dci_builderLayout`, clamped), `components/Splitter.vue` (drag handle, v-model px, `invert` for
  panes after the handle). The SQL panel width is capped in CSS so the middle keeps 26rem.
- Downloads on every page (feedback #146, #149): `lib/tableDoc.js` (`docFrom`/`sheetsFrom`: a page
  describes its sections as kv, DataTable-style columns plus rows, list, text or code);
  `DownloadMenu` has `small` and an icon-only form (`label=""`).
- Loading details (feedback #143): `api.js` keeps the paths in flight and jobs set with
  `setTask`/`endTask`; `lib/loadingText.js` names them; `fetchAllPages` reports its pages.
- Preload (feedback #147): `app/usePreload.js` (once per org and data space per tab: catalog,
  streams, mappings, record IDs, usage, then Health if its result is over an hour old);
  `lib/preload.js` (`dci_preload`, on unless 'off'). Job results now in chrome.storage.local.
- Credit prediction (feedback #145): `lib/credits.js` (Tenant consumption objects by name, field
  guesses, SQL, `forecast`), `views/CreditsView.vue`. Field names from Salesforce Help's Digital
  Wallet DLO references (listed at the top of `credits.js`). The objects exist only in production
  but hold sandbox and scratch usage: every figure splits by environment (`usagebusinessenvtype__c`
  or `businessenvtype__c`) and by org (`usagereportingorgid__c`); credits left stay shared. Without
  the objects the page shows how to enable them (Digital Wallet setup, add to a data space). Not
  yet seen on an org with the data.
- Health details (feedback #148): `lib/healthDetails.js` (detail path per kind, status and
  error-like fields of the response); segments add their publish history.
- Org names (feedback #140, #144): `orgName`/`orgTitle` in `app/useOrg.js`, `orgLabel` in
  `lib/savedOrgs.js`.
- `src/views/`: pages. `src/app/useOrg.js`: selected org and API version.

## API facts (checked live 2026-10-22, API v68.0)

- The browser sid works on every `ssot` endpoint; `ssot` is not listed in `/services/data/vXX/`.
- POST `ssot/query-sql` `{ sql, rowLimit }` answers `{ data, metadata: [{ name, type }], returnedRows,
  status: { queryId, completionStatus: 'ResultsProduced', rowCount } }`. Without `rowLimit` the
  first page stops near 48k rows. More rows: GET `query-sql/<id>/rows?offset=&rowLimit=`.
  Status: GET `query-sql/<id>`. Unordered queries page in no stable order.
- The SQL dialect is PostgreSQL-like (`generate_series` works, `UNNEST(SEQUENCE())` does not).
- Mappings need `dmoDeveloperName` (a DLO name alone is a 400).
- Data graphs (checked 2026-10-23): `ssot/data-graphs/metadata` lists a graph only once it has
  built, without labels (`developerName`, `dgObject`, `paths`, `idsDmo`, `valuesDmo`); SOQL on
  `DataGraph` (`DataGraphApiName`, `Status`, `LastRunStatus`, `RecordCount`, `DataSpaceId`) lists
  all; `ssot/data-graphs/<name>` gives the definition (`sourceObject`, `path`, `sourceFieldName`);
  `ssot/data-graphs/data/<name>/<primary record id>` gives one record, `json_blob__c` HTML-escaped.
  The values table (`valuesDmoName`) has `Id__c` and `json_blob__c`.
- Data streams report `lastRunStatus: 'NONE'` for a stream that never ran.
- Identity resolution: `identity-resolutions` gives match rules and, per entity, `unifiedDmoName`
  and `linkDmoName`. Link DMOs: `SourceRecordId__c`, `UnifiedRecordId__c`, `MatchKeys__c`.
  Phones are stored as typed (`(415) 555-0100`, no country code).

## Feedback

`src/components/feedback/` is ported from the Toolkit. Rows land in D1
`sfmc-query-saver-feedback` with `app = 'data-cloud-inspector'`, `screen =
'data-cloud-inspector/<page>'` (profile IDs replaced by `:id`). Read them from
`../sfmc-toolkit/workers/feedback`:
`npx wrangler d1 execute sfmc-query-saver-feedback --remote --command "SELECT id, kind, message, details, metadata FROM feedback WHERE app = 'data-cloud-inspector' ORDER BY created_at DESC"`
(with `CLOUDFLARE_ACCOUNT_ID`); screenshots with `sh show-screenshot.sh <id>`.

## Rules

- Read only. Never widen `guard.js` without the user's okay.
- The session ID stays in the service worker.
- Reports meant for sharing use `describeShape`: keys and types, never values (client orgs).
- Endpoint shapes not yet seen live are guesses until a connection report confirms them.

## Live testing

`../data-cloud-inspector-live/` (outside the repo): `launcher.cjs` keeps a Chromium on the
Jetson desktop with the user's dev org session and this extension loaded (reloads when
`dist/manifest.json` changes); `sf.cjs` calls the API through the extension; `ui.cjs <script>`
drives the UI. Do not use `--load-extension` plus reload: Chromium then disables it.

## Checks

- `npm test` (vitest), `npm run build`.
- Headless end to end: load `dist/` in `~/.cache/ms-playwright/chromium-1243` with
  `--host-resolver-rules="MAP acme.my.salesforce.com:443 127.0.0.1:8443"`,
  `--ignore-certificate-errors`, a local https stub and a `sid` cookie set via CDP.
