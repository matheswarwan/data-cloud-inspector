# Changelog

Store versions of Data Cloud Inspector, newest first. Each entry says whether permissions changed. Builds 1.1.0 to 1.7.0 and the 0.x test builds were never published; they are folded into 1.0.0.

## Unreleased (next: 1.0.8)

Security and privacy changes for enterprise review (`security/audits/1.0.7-0b0cf86.md`).

**Permissions: narrower.** Removed `unlimitedStorage` and the hosts `*.salesforce.com`, `*.force.com`, `*.salesforce-setup.com`; `*.cloudforce.com` is now optional (Settings). Added `activeTab` (no install warning). Host access is `https://*.my.salesforce.com/*` only. Chrome does not ask users to approve anything for this update.

- Explicit Content Security Policy: scripts from the package only, network calls only to Salesforce and the feedback service.
- Administrator policy through Chrome (`managed_schema.json`): `authMode` (`oauth-only` never reads the browser session cookie), `allowedOrgDomains`, `disableCache`, `disableQueryHistory`, `disableDiagramforce`. Settings shows the policies in force.
- Bulk lookup and Compare results (people's records) are kept only until the browser closes; copies kept by earlier versions are deleted on update.
- Feedback: Send posts to the developer's feedback service as before, or Open email starts a message in your own mail app; administrators can turn sending off (`disableFeedbackUpload`).
- Open in Diagramforce is off until turned on in Settings.
- Log in with OAuth: log in to an org by its My Domain without a browser session; Log out revokes the token in Salesforce.
- Read-only guard: only `/services/data/` paths (Apex REST and other `/services/` paths refused).
- Privacy policy from one source (`PRIVACY.md`), bundled in the extension (Help, Settings, Home) and hosted; publisher Ateko. `SECURITY.md`, `docs/security-summary.md`, `docs/enterprise-deployment.md`, reproducible build with SHA-256 (`npm run package`).

## 1.0.7 (2026-10-27)

No permission changes. Connection menu Load everything; segment criteria in words; user details on Home; org data kept in this browser and refreshed in the background; Personalization record panels; JSON graphs as PNG/SVG; Credit prediction setup; Look it up in Data Cloud on Objects; Open in Diagramforce; Marketing Cloud Next (consent, message history, Marketing flows, Campaigns, Health checks); stream SQL; paged tables; flow diagrams; foldable Home sections with Log in with OAuth; feature switches.

## 1.0.6 (2026-10-25)

No permission changes. Org names instead of domains; loading messages; Download menu on every page; Credit prediction; Preload when connected; Health details; creator credit. Rebuilt 2026-10-26: Health lists every failed item by name.

## 1.0.5 (2026-10-24)

No permission changes. Query builder: resizable panes, full-screen SQL and results, results downloads.

## 1.0.4 (2026-10-24)

No permission changes. Saved orgs and Log in buttons on Home; Query builder rebuilt; JSON viewer and API console; compare up to 10 people; every segment listed; zero-copy streams no longer flagged on Health; Bulk lookup by more ID kinds; Copy for AI on SQL errors; progress bars.

## 1.0.3 (2026-10-23)

No permission changes. Home page; Help page, help marks and first-visit tips; Query builder and Data graphs pages; join any object; Data streams lineage view; random examples.

## 1.0.2 (2026-10-23)

No permission changes. Sort and filter on every table; resizable, hideable side lists; Data models diagram; Data graphs on the SQL page.

## 1.0.1 (2026-10-23)

No permission changes. Grouped left sidebar; Download menu (Markdown, Word, PDF, HTML, Excel) instead of Copy as Markdown; Data models page.

## 1.0.0 (2026-10-23)

First Chrome Web Store version. Permissions: `cookies`, `storage`, `unlimitedStorage`, `identity`; hosts `*.salesforce.com`, `*.force.com`, `*.salesforce-setup.com`, `*.cloudforce.com`. Profiles, identity resolution, segments, SQL, objects explorer, data streams, activations, insights, Personalization, bulk lookup, health, storage, connection check.
