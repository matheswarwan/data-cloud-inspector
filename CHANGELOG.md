# Changelog

Store versions of Data Cloud Inspector, newest first. Each entry says whether permissions changed. Builds 1.1.0 to 1.7.0 and the 0.x test builds were never published; they are folded into 1.0.0.

## Unreleased (next: 1.0.9)

- Appearance is Light until you choose Dark or System in Settings (feedback #1067). A "System" saved by an earlier build switches to Light once; choosing System again is kept.
- Credit prediction fixes (feedback #1065): By environment no longer squeezed into a narrow column beside Top resources (the block grid measured the wrong width); chart colours set directly so bars keep their colour in screenshots; a number in the unit field (1073741824, 1000000) is no longer shown as a unit.
- People: each section can be maximized to fill the window (Esc or the button restores), and the side column's section headers no longer break (feedback #1066).
- New page Data targets (feedback #1064): every activation target from ActivationTarget (platform, connection and target type, output format, status, run status, last publish and its error, export directory or endpoint, owner, communication capping), the activations that send to it, its audience objects with row counts, and all fields. An activation's Target now opens it.
- Health in the new layout (design "Option D – Health"): a score ring with the headline ("3 things failed and 120 need a look"), a tile per area that filters the page, problems in groups (Failed activations, Segments never published, Engagement data going stale on a 1 hour to 1 year scale, Inactive) with numbered rows, hints for known errors such as partnererror, Mark as expected (this browser; they count as OK), what changed since the last check with "new" badges, and Problems / Everything.
- Credit prediction: Customize layout (move blocks with drag or arrows, half or full width, Reset; saved in this browser).
- Credit prediction: money figures use the list price of $500 per 100,000 credits ($0.005 a credit) until you enter your own (feedback #1062).
- Credit prediction in the new layout (design "Option D – Credit prediction"): Read again, Show in money (price per credit only while it is on), Download and About this data in the header; banners when a card is over its purchase or sandbox use is rising; larger tiles; a taller chart with gridlines, month labels, a Today line, hatched projected days and a day panel beside it (the last full day until you click another); cards by share used with a ring, Used / Purchased / Left or Over, By environment and What used it, plus cards not used yet; the top 6 resources with See all; one card per environment with its trend and a 90-day line. Setup, SQL and the by-org and to-date tables are under About this data.
- People > One person shown as cards (design "Option D – People (cards)"): a person card with counts and indicator chips (true/false fields that are true), source record cards, one card per email or phone across sources with its consent and any related row that holds the contact point's ID, related objects as cards (dated rows as a timeline), engagement by month with channel filters, segment membership with recent adds and removals. Every section has Table and SQL.
- Storage full: when the browser's 10 MB of extension storage is full, older cached org details (other orgs first) are dropped to make room instead of the write failing with "kQuotaBytes quota exceeded" (feedback #1061). Saved queries, history, orgs and settings are never dropped.
- Credit prediction: each usage event counted once (a card's breakdown came to double its total), and a note when a card's breakdown and its total still differ (feedback #1060).

## 1.0.8 (2026-10-29)

Security and privacy changes for enterprise review (`security/audits/1.0.7-0b0cf86.md`).

**Permissions: narrower.** Removed `unlimitedStorage` and the hosts `*.salesforce.com`, `*.force.com`, `*.salesforce-setup.com`; added `activeTab` (no install warning). Host access is `https://*.my.salesforce.com/*` and `https://*.cloudforce.com/*` (older orgs; feedback #1045). Chrome does not ask users to approve anything for this update.

- Explicit Content Security Policy: scripts from the package only, network calls only to Salesforce and the feedback service.
- Administrator policy through Chrome (`managed_schema.json`): `authMode` (`oauth-only` never reads the browser session cookie), `allowedOrgDomains`, `disableCache`, `disableQueryHistory`, `disableDiagramforce`. Settings shows the policies in force.
- Bulk lookup and Compare results (people's records) are kept only until the browser closes; copies kept by earlier versions are deleted on update.
- Feedback: Send posts to the developer's feedback service as before, or Open email starts a message in your own mail app; administrators can turn sending off (`disableFeedbackUpload`).
- Open in Diagramforce can be turned off in Settings (on by default, feedback #1045) and blocked by the administrator.
- Log in with OAuth: log in to an org by its My Domain without a browser session; Log out revokes the token in Salesforce.
- Read-only guard: only `/services/data/` paths (Apex REST and other `/services/` paths refused).
- Privacy policy from one source (`PRIVACY.md`), bundled in the extension (Help, Settings, Home) and hosted; publisher Ateko. `SECURITY.md`, `docs/security-summary.md`, `docs/enterprise-deployment.md`, reproducible build with SHA-256 (`npm run package`).

**New and fixed since 1.0.7** (feedback #1023 to #1059):

- Search box on every table; Help lists what changed in each version (this page).
- Segments: counts, person check and publish history first, criteria folded; segment ID with Copy and search by ID; Members table, 100 at a time with names; for segments never published, who matches the criteria now; publish history chart shows each publish's count and change on hover; the person check reads the membership history and nested segments.
- Profiles keeps the search, its results and the profiles opened while the app is open, with a results bar to step through them.
- Profiles and Bulk lookup are one People page with two tabs, One person and A list (up to 1,000); both old addresses still open their tab.
- Every page card on Home has its name, description and icon (Credit prediction had no description).
- Insights: filter the Data tab by values of one column (pasted IDs), with the SQL to open; the Download menu is no longer cut off.
- Credit prediction: Top resources (which data stream, data transform, segment or other resource used the credits, with share and approx money) and the same per day on hover; price per credit for money estimates; numbers read as "~512 million"; the last reading is kept and shown without querying until Read again. Credits by card: purchased, used and left with a bar, each card opening to the resource types that used it. Click a day to keep its card open, copy it or see every resource. The projection follows the usual day-of-week pattern instead of a flat line. Each card says what it is, counts storage in its own unit, explains an overage and breaks down by resource or usage type.
- SQL: field autocomplete without a table prefix, objects grouped by use with Individual first. DLO mapping diagram on Objects. Side lists fit their cards.
- Personalization, Marketing flows and Campaigns are hidden until turned on in Settings > Pages, with their Health sections and the Marketing Cloud Next panels on Profiles.
- Org details (segments, activations, insights, streams, mappings, flows, campaigns, data graphs) are used from this browser for a day by default (Settings > Storage > Keep org details) and read once for every page; Health sections each have Copy (failed and needs a look, or all) and Download.

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
