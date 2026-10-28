# Data Cloud Inspector

A read-only Chrome extension for Salesforce Data Cloud (Data 360). It uses the Salesforce
login you already have in the browser, so there is nothing to install in the org.

Published by Ateko. Status: 1.0.7 on the Chrome Web Store; 1.0.8 (security and privacy changes, see `CHANGELOG.md`) is on `main`. Zips are in `releases/`.

## Security and privacy

- The extension only reads, and its only network calls go to your own Salesforce org (enforced by its Content Security Policy). No analytics.
- Privacy policy: `PRIVACY.md` (also bundled as `privacy.html` and hosted at https://data-cloud-inspector.mathes.dev/privacy). Security contact: `SECURITY.md`.
- For reviewers: `docs/security-summary.md` (data flow, permissions, OAuth, storage, network calls) and `security/audits/`.
- For administrators: `docs/enterprise-deployment.md` (force-install, limit to your org, OAuth only, cache and history off).
- Build: `npm ci && npm run package` gives a reproducible zip and its SHA-256 in `out/`; `npm run package:verify` builds twice and compares.
- License: MIT (`LICENSE`).

## What it does

Home shows whether the org is connected and as whom, a short read-only promise, the most used
pages and recent queries. Help (bottom of the sidebar, next to Settings) explains every page;
question marks next to headings explain that part, and pages with easy-to-miss features show
a tip on the first visit (off in Help or from the tip). SQL anywhere in the tool (calculated
insights, segments, Query builder, data graphs) is shown in a read-only editor with highlighting.
JSON anywhere (REST explorer, activation filters, segment criteria, connection check, data graph
records, SQL result cells) opens in a viewer: a searchable Tree (click a key to copy its path), a
Graph of the objects inside, and Text, with Copy and Download. Settings, Tools: an API console at
the bottom lists every call with its request and response (memory only), downloadable as Markdown.

Pages are in a left sidebar (collapsible), grouped: Objects and SQL; Bulk lookup and
Profiles; Data streams, Data models, Identity, Segments, Activations and Insights;
Personalization; Compare, REST explorer, Health and Connection check. Wherever a page used to
have Copy as Markdown it now has a Download menu: View, Copy, Markdown, Word (.docx), PDF
(print), HTML, and Excel where there are tables.

Tables sort by any column (click the header) and filter per column (the funnel icon: text,
or a list of values to tick when a column has few of them). The list on the left of Objects,
SQL, Data streams, Identity, Segments and Activations can be resized (drag its edge,
double-click to reset) or hidden; both are remembered per page.

- Profiles (an empty search offers 10 random people, as does Bulk lookup): look up a person by email, phone, name or ID (`*` as a wildcard) and pick an
  identity resolution ruleset. The page shows the unified record, the source records behind
  it with the link's match keys, the ruleset's match rules with each record's values and the
  pairs that satisfy them, people who share an email but are not in the profile, contact
  points, an engagement timeline, segment membership and every other related record (found
  through the metadata's relationships). The Download menu views, copies or saves the whole profile (Markdown, Word, PDF, HTML).
- SQL: query tabs (each with its own SQL, editor and results, running at the same time; the
  tabs are remembered). Run Data Cloud SQL against DLOs, DMOs and calculated insights, with an Objects panel
  (search, expand, insert an object, a field or a SELECT of ticked fields), table and field
  autocomplete from the org, Format, saved queries and history. Results sort by any column, filter, open a cell's full value and copy a column; they load 1,000 rows at a
  time; Download CSV fetches every row (up to 500,000); Copy for AI copies the SQL, column
  types and the first 50 rows as Markdown.
- Data graphs (own page, under Identity): every data graph with its objects and fields, status and
  record count; Objects joined as SQL (a SELECT joining the graph's objects along the graph's
  own join fields), The built graph as SQL (its values table, one JSON document per record),
  and Fetch one record's graph (GET `ssot/data-graphs/data/<name>/<id>`, JSON expanded).
- Query builder (own page, under SQL; after the Marketing Cloud Toolkit's): objects on the left
  (searchable, grouped DMO, DLO, calculated insight); Step 1 the tables, each joined to an earlier
  one (left or inner, one or more conditions with AND or OR, suggested from the org's
  relationships or a shared field, move up or down); Step 2 output fields and computed columns;
  Step 3 filters; Step 4 DISTINCT, LIMIT, ORDER BY, GROUP BY. List or Visual (a canvas of the
  tables and joins). The SQL on the right or below: Copy, Save as query, Count rows, Run (results
  inline), Open in a SQL tab. The draft is kept per org and data space.
- Objects: every DLO, DMO and calculated insight with fields, API names, types, primary keys
  and key qualifiers; relationships; for a DMO, the objects mapped to it field by field and
  their data streams; for a DLO, its data stream and the DMOs it maps to; Used by: the
  calculated insights (from their SQL) and segments (from their criteria) that use the object
  and which fields, with the segments' activations, also shown per field. Row counts, Query,
  Copy SELECT and the Download menu. A calculated insight shows its definition: SQL, formulas,
  schedule, last run and errors.
- Data models: the DMOs with something mapped into them, or all of them, with category,
  field count, the DLOs and streams mapped into each and what uses them; download as
  Markdown, Word, PDF, HTML or Excel (sheets for DMOs, fields and mappings).
  Diagram view: the same DMOs as an interactive entity diagram (keys and join fields,
  relationships with cardinality, optionally the DLOs mapped in; pan, zoom, move boxes, click
  a box for its connections), exported as SVG, PNG, Markdown with Mermaid, Mermaid, draw.io
  or Graphviz. Laid out with dagre (`@dagrejs/dagre`, bundled, loaded with the diagram).
- Identity: every ruleset with match and reconciliation rules in plain words, stats
  (consolidation rate), source records per unified profile, the largest profiles, where records
  come from, and Compare people (two to ten) criterion by criterion, with the groups the rules
  would form next to the unified profiles they are in.
- Bulk lookup (also from Profiles): up to 1,000 emails, phones or IDs (detected, short digit runs
  count as IDs; or say what they are, including values of any field on Individual or an object
  related to it; IDs also match external record IDs and party identification numbers), checked
  200 per query:
  found, source records, unified profile, segment membership and whether the criteria match now;
  CSV and Markdown; runs in the background.
- Data streams: a table of every stream or a lineage diagram (stream, DLO, DMOs); per stream: source, schedule, record counts, problem records, the DMOs it maps into,
  and its source fields with the DLO field each lands in.
- Activations (with a Download menu; filters in plain words): segment, target, refresh, last publish, attributes sent with output
  names, contact points, filters, latest and history audience with row counts.
- Insights: calculated insights as Data Cloud shows them: a list view, and a record page with
  Details, Expression (SQL), Output (dimensions and measures), Data (a preview) and Used by.
- Segments: every segment with status, schedule and member count; the criteria in plain
  words and as raw JSON; counts at the last publish, in the membership table and matching
  the criteria now; the equivalent SQL; publish history; and "is this person in the
  segment?" with which condition keeps them out.
- Health: every data stream, identity resolution ruleset (source and unified profiles,
  consolidation rate), calculated insight, segment and activation with a status (failed,
  needs a look, running, inactive, OK) and the reason, problems first; Download menu (Markdown, Word, PDF, HTML, Excel).
- Personalization: points with their decisions by priority, recommenders (status, last
  refresh), experiments with their decisions, content schemas and objectives (SOQL); activity
  from the personalization log (requests per day, by point, decision and recommender, by
  status code, latest requests linked to profiles). Recommenders also show on Health.
- Open in Salesforce: record IDs in profiles, related records and SQL results (segments,
  streams, DLOs, calculated insights, rulesets, activation targets, Contacts, Accounts) link
  to their page in the org; Objects has Open in Salesforce (DMOs open in the Data Model tab by API name).
- Connection pill (top right): the org in use and its status, who you are signed in as,
  other logged-in orgs, and a connection check that shows how the tool connects (the user,
  profile, role and Data Cloud permission sets it acts as) with a shareable report
  (response shapes only).
- REST explore with examples that fill in the request.
- Ctrl+K search over pages, objects, fields, segments and saved queries, with Find person.
- Compare two orgs: objects, fields (and type changes), segments, calculated insights and data
  streams in only one.
- Export data model: one HTML or Markdown document of DMOs, DLOs and calculated insights with
  fields, mappings, streams and usage.
- Health also counts each stream's problem records (rejected rows); Personalization shows data
  graphs.
- Health and Compare run as background jobs: use other pages meanwhile (the nav shows running
  and finished); results are kept until the browser closes.
- Settings: System, Light or Dark theme; Storage with the size of everything kept and Delete per
  part (per org where it applies) or everything; export and import saved queries.
- Feedback (header button): problem, idea or question, an optional marked-up screenshot and
  optional technical details shown before sending. Sent to the Marketing Cloud Toolkit's
  feedback Worker with `app = 'data-cloud-inspector'`.

## Planned

- Segment debugger.
- Web events: decode a site's web SDK beacons and link them to profiles (needs optional site
  permissions).

## How it signs in

The same way Salesforce Inspector Reloaded does. The service worker reads the org's `sid`
cookie on its `my.salesforce.com` domain (the session on `lightning.force.com` has no API
access) and sends it as a Bearer token. The session never reaches the app page. Orgs are
told apart by the org ID at the start of the session, so several logged-in orgs work.

## When the browser session is not enough

- An org without Data Cloud, or a user without access, gets one clear message instead of
  errors on every page; so does a session Salesforce rejects.
- Orgs with API Access Control reject API calls from browser sessions. Settings, Log in with
  OAuth uses your own External Client App (callback URL shown there, PKCE) through Chrome's
  login window; the token stays in session storage until the browser closes.

## Data spaces

Pick the data space in the connection menu (shown on the pill when an org has more than one).
Endpoints that take `dataspace` get it (SQL, metadata, calculated insights, segments, data
graphs, mappings); lists that ignore it (streams, rulesets, activations, Personalization setup)
are filtered by the space each item names. Caches are kept per org and data space.

## Caching

Metadata is cached per org until Refresh. Data streams, mappings, record IDs and usage are kept
for 30 minutes and rulesets for 5, in session storage (gone when the browser closes).

## Read only

Every call goes through `src/background/guard.js`: GET on `/services/...` paths, and POST
only to the Data Cloud query endpoints (`ssot/query-sql`, `ssot/queryv2`). Anything else
is refused before a request is made.

## Build and test

```
npm install
npm test
npm run build
```

Test and release zips are in `releases/` (also attached to the GitHub releases). Unzip one, or
load `dist/` after a build, as an unpacked extension (chrome://extensions, Developer mode, Load unpacked).
Click the toolbar icon on a Salesforce tab to open the inspector on that org.
