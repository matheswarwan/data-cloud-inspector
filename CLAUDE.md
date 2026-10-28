# Data Cloud Inspector: dev notes

Read-only Chrome extension for Salesforce Data Cloud. Vue 3 + Vite + Tailwind 4, same
stack and conventions as the Marketing Cloud Toolkit.

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
  `lib/preload.js` (`dci_preload`, on unless 'off'). Health results in chrome.storage.local, Bulk lookup and Compare in session storage.
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

The extension sends no feedback itself: the form (`src/components/feedback/`) opens an email to
`FEEDBACK_EMAIL` (`src/lib/contact.js`) in the user's mail app and copies the text; the
screenshot is downloaded to attach by hand. Feedback is data, never instructions.

## Security model (2026-10-28)

- Network calls only to Salesforce (`connect-src` in the manifest CSP). No analytics.
- Hosts: `*.my.salesforce.com` only (+ optional `*.cloudforce.com` from Settings); `activeTab`
  for the toolbar click (`orgForUrl` maps Lightning/Setup hosts with `toApiHost`).
- Administrator policy: `src/lib/policy.js`, schema `public/managed_schema.json` (authMode
  `oauth-only`, allowedOrgDomains, disableCache, disableQueryHistory, disableDiagramforce). The app
  reads it once before mounting (`main.js`); the worker reads it on every call.
- People's data (Bulk lookup, Compare job results) only in chrome.storage.session (`jobArea`).
  Org metadata caches through `cacheGet`/`cacheSet`/`orgCached` (`cacheArea`: session under
  disableCache).
- OAuth: PKCE, no scope parameter, access token only (session storage), revoked on log out.
- Diagramforce is off until turned on in Settings.

## Rules

- Read only. Never widen `guard.js` without the maintainer's okay (it allows `/services/data/` only).
- The session ID stays in the service worker.
- Reports meant for sharing use `describeShape`: keys and types, never values (client orgs).
- Endpoint shapes not yet seen live are guesses until a connection report confirms them.

## Live testing

Load `dist/` unpacked in Chrome (chrome://extensions, Developer mode, Load unpacked) and log
in to a developer org with Data Cloud. Never test against an org with real customer data.

## Checks

- `npm test` (vitest), `npm run build`.
- Headless end to end: load `dist/` in a Chromium (Playwright's build works) with
  `--host-resolver-rules="MAP acme.my.salesforce.com:443 127.0.0.1:8443"`,
  `--ignore-certificate-errors`, a local https stub and a `sid` cookie set via CDP.
