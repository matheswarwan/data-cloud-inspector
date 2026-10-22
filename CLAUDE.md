# Data Cloud Inspector: dev notes

Read-only Chrome extension for Salesforce Data Cloud. Vue 3 + Vite + Tailwind 4, same
stack and conventions as `../sfmc-toolkit`. Plan and status log: `../data-cloud-inspector-plan.md`.

## Layout

- `src/background/`: service worker. `orgs.js` (sid cookies to orgs, my-domain rewrite),
  `sessions.js` (cookie reads, fresh per call), `guard.js` (read-only rule),
  `fetchProxy.js` (Bearer sid, `Sforce-Call-Options: client=DataCloudInspector`, no cookies sent).
- `src/lib/`: page-side helpers. `api.js` (SF_FETCH), `shape.js` (response shapes without
  values), `checks.js` (connection check and its shareable report).
- `src/views/`: pages. `src/app/useOrg.js`: selected org and API version.

## Rules

- Read only. Never widen `guard.js` without the user's okay.
- The session ID stays in the service worker.
- Reports meant for sharing use `describeShape`: keys and types, never values (client orgs).
- Endpoint shapes not yet seen live are guesses until a connection report confirms them.

## Checks

- `npm test` (vitest), `npm run build`.
- Headless end to end: load `dist/` in `~/.cache/ms-playwright/chromium-1243` with
  `--host-resolver-rules="MAP acme.my.salesforce.com:443 127.0.0.1:8443"`,
  `--ignore-certificate-errors`, a local https stub and a `sid` cookie set via CDP.
