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
  (follow `nextPageUrl` as given), `query.js` (query-sql run, poll, rows paging, CSV, Markdown).
- `src/app/useCatalog.js`: metadata cached per org in chrome.storage.local until Refresh.
- `src/views/`: pages. `src/app/useOrg.js`: selected org and API version.

## API facts (checked live 2026-10-22, API v68.0)

- The browser sid works on every `ssot` endpoint; `ssot` is not listed in `/services/data/vXX/`.
- POST `ssot/query-sql` `{ sql, rowLimit }` answers `{ data, metadata: [{ name, type }], returnedRows,
  status: { queryId, completionStatus: 'ResultsProduced', rowCount } }`. Without `rowLimit` the
  first page stops near 48k rows. More rows: GET `query-sql/<id>/rows?offset=&rowLimit=`.
  Status: GET `query-sql/<id>`. Unordered queries page in no stable order.
- The SQL dialect is PostgreSQL-like (`generate_series` works, `UNNEST(SEQUENCE())` does not).
- Mappings need `dmoDeveloperName` (a DLO name alone is a 400).
- Data streams report `lastRunStatus: 'NONE'` for a stream that never ran.

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
