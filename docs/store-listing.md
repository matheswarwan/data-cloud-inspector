# Chrome Web Store listing: Data Cloud Inspector

Text for the Chrome Web Store dashboard (new item). Screenshots are in `docs/store/`.

## Before publishing

- **Name and trademark.** "Data Cloud" is a Salesforce product name (now branded Data 360). The
  Toolkit got a trademark warning for "SFMC". Salesforce Inspector Reloaded uses "Salesforce" in
  its name, and the store's policy allows a product name when it describes compatibility. The
  safest wording keeps the description clear that this is an independent tool (see the last line
  of the description). If a warning comes, a fallback name is "Unified Profile Inspector".
- **Privacy policy URL:** https://data-cloud-inspector.mathes.dev/privacy (Worker
  `data-cloud-inspector-site`, source in `site/`; deploy steps in `site/wrangler.jsonc`).
- **Publisher:** CloudKettle's developer account (same as SFMC Query Saver).
- **Version:** 1.0.0, `releases/data-cloud-inspector-1.0.0.zip` (GitHub release `v1.0.0`). The first store version. Builds numbered 1.1.0 to 1.7.0 were never published; they are folded into this 1.0.0 (GitHub pre-releases, zips in `releases/archive/`).

## Submitting (CloudKettle developer account)

1. Chrome Web Store Developer Dashboard, signed in to the CloudKettle publisher, then New item.
2. Upload `releases/data-cloud-inspector-1.0.0.zip`.
3. Store listing tab: name, summary (from the manifest), description, category Developer Tools,
   language English, the five screenshots from `docs/store/` (the store takes at most five), the
   128 px icon (`public/images/icon128.png`) and the small promo tile `docs/store/promo-440x280.png`.
4. Privacy practices tab: single purpose, the permission justifications, data usage and the
   certifications below; privacy policy URL https://data-cloud-inspector.mathes.dev/privacy.
5. Distribution: Visibility **Unlisted** first (only people with the link can install), all
   regions. Switch to Public after it has been tried on a few real orgs.
6. Submit for review. Tell Claude when it is published, so the release can be recorded.

## What's new (version notes)

1.0.0: first release.

## Name

Data Cloud Inspector

## Summary (from the manifest, at most 132 characters)

Read-only inspector for Salesforce Data Cloud: profiles, segments, SQL and the data model, using your existing Salesforce login.

## Description

Data Cloud Inspector is a read-only tool for people who build and support Salesforce Data Cloud (Data 360). It works with the Salesforce login you already have in this browser: there is nothing to install in the org, no connected app and no password to enter.

PROFILES
- Look up a person by email, phone, name or ID, and pick an identity resolution ruleset.
- See the unified record and every source record behind it, with the data stream each came from.
- See the ruleset's match rules side by side with each record's values, and which records satisfy them.
- Find people who share an email but were not unified with this profile.
- Contact points, an engagement timeline, segment membership and every other related record, found through your org's own data model.
- View, copy or download the whole profile: Markdown, Word, PDF or HTML.

SQL
- Run Data Cloud SQL against data lake objects, data model objects and calculated insights.
- Query tabs: several queries at once, each with its own results.
- Query Builder: tick fields, add related objects (the joins come from your org's relationships), add filters, count the rows, then open the SQL in a tab.
- Search your objects beside the editor and insert an object, a field, or a SELECT of the fields you tick.
- Autocomplete for every object and field in your org, Format, saved queries and history.
- Sort and filter the results, open a cell's full value, copy a column.
- Load results 1,000 rows at a time, download every row as CSV, or copy the results ready to paste into an AI assistant.

IDENTITY RESOLUTION
- Every ruleset with its match and reconciliation rules in plain words, and its stats: source and unified profiles, consolidation rate, last run.
- How many source records each unified profile has, and the largest profiles, where wrong merges usually hide.
- Compare two people: criterion by criterion, would this ruleset join them, and are they in the same profile.

SEGMENTS
- Every segment with its status, schedule and member count.
- The criteria in plain words, and the equivalent SQL.
- Compare the count at the last publish, in the membership table, and matching the criteria now.
- Publish history and size over time.
- Check whether a person is in a segment, and which condition keeps them out.

CALCULATED INSIGHTS
- Every calculated insight as Data Cloud lists it: data space, status, last run time and status, schedule.
- Its details, its SQL (expression) formatted, its dimensions and measures with formulas, a preview of its data, and what it reads and which segments use it.

HEALTH
- One page for data streams, identity resolution, calculated insights, segments and activations, problems first.
- Why each one needs a look: never ran, last run failed, rows rejected (problem records), no source profiles, overdue publish.
- Consolidation rate and profile counts per identity resolution ruleset.
- View, copy or download the report (Markdown, Word, PDF, HTML or Excel) for a status update.

BULK LOOKUP
- Paste up to 1,000 emails, phones or IDs and see for each: found or not, its unified profile, and whether it is in a segment and matches it now. Download as CSV.

DATA STREAMS AND ACTIVATIONS
- Every data stream with its source, schedule, record counts, problem records, the DMOs it feeds, and its fields.
- Every activation with its segment, target, the attributes it sends, its contact points and its audience.

PERSONALIZATION
- Personalization points with their decisions in priority order, recommenders, experiments, content schemas and objectives.
- Data graphs with their objects.
- Activity from the personalization log: requests per day, by point, decision and recommender, status codes, and the latest requests linked to the person's profile.

OBJECTS
- Every DLO, DMO and calculated insight with fields, API names, types, primary keys and key qualifiers.
- Relationships between objects.
- For a DMO: what is mapped into it, field by field, and the state of each data stream.
- For a DLO: its data stream and the DMOs it maps to.
- Used by: the calculated insights, segments and activations that depend on an object, field by field, so you can see what a change would affect.
- Row counts, a ready-made SELECT, and the object as Markdown, Word, PDF, HTML or Excel.

ALSO
- Pages in a left sidebar, grouped. Ctrl+K to search pages, objects, fields, segments and saved queries, or find a person.
- Compare two orgs, for example a sandbox and production: objects, fields, segments, calculated insights and data streams that differ.
- Data models: the DMOs with something mapped into them, or all of them, with their sources and what uses them; download as Markdown, Word, PDF, HTML or Excel.
- Data spaces: pick the data space in the connection menu.
- Open records in Salesforce: segments, data streams, DLOs, calculated insights, rulesets and CRM records link to their page in the org.
- REST explore with ready-made examples for the Data Cloud API.
- A connection check that shows which Data Cloud APIs your org answers.
- Light, dark or system theme.
- See what the extension stores, with sizes, and delete any part of it.
- Send feedback with a screenshot you can mark up.

READ ONLY
Data Cloud Inspector never changes data or setup. It only reads, and the one kind of request it sends that is not a plain read is a Data Cloud SQL query. Your Salesforce session stays inside the extension and is sent only to your own org.

Data Cloud Inspector is an independent tool. It is not made by or affiliated with Salesforce.

## Category

Developer Tools

## Language

English

## Single purpose (Privacy practices tab)

Data Cloud Inspector lets Salesforce Data Cloud users inspect their own org, read only: look up unified profiles, check identity resolution and segments, inspect calculated insights and Personalization, run Data Cloud SQL, and view the data model, its health and how data flows into it.

## Permission justifications (Privacy practices tab)

- **cookies:** the extension calls the user's Salesforce org with the session they already have in this browser. It reads the Salesforce `sid` cookie of the org's own domain and sends it only to that org, as the API's authorization header. It also reads the cookie of the current Salesforce tab to know which org that tab belongs to. The session is never stored or sent anywhere else.
- **storage:** settings, saved queries, query history, and a cache of the org's Data Cloud metadata (object and field names) are stored locally in the browser.
- **identity:** only for the optional "Log in with OAuth" in Settings, for orgs that block API calls from browser sessions. It opens the org's own Salesforce login window (`chrome.identity.launchWebAuthFlow`) for the user's External Client App and receives the authorization code. The resulting access token is kept in session storage, used only for that org, and gone when the browser closes.
- **unlimitedStorage:** the metadata cache is several hundred KB per org, and users who work in many orgs can pass the default local storage limit.
- **Host permissions:**
  - `https://*.salesforce.com/*`, `https://*.cloudforce.com/*`: the org's own API domain (`<my domain>.my.salesforce.com`), which the extension calls on the user's behalf, and where the session cookie lives.
  - `https://*.force.com/*`, `https://*.salesforce-setup.com/*`: Lightning and Setup pages. When the user clicks the toolbar icon on one of these tabs, the extension reads that tab's session cookie to open on the right org. Nothing is injected into these pages.
- **Remote code:** none. All code is in the package.

## Data usage (Privacy practices tab)

- **Authentication information:** yes. The Salesforce session cookie is read to call the user's own org, and is not stored or transmitted anywhere else. If the user chooses Log in with OAuth, the access token is kept in session storage until the browser closes and sent only to that org.
- **Personally identifiable information:** yes, shown only. Profiles and query results display records from the user's org (names, emails, phones). They are not stored and not sent anywhere except between the browser and the user's own org. A name or email typed into the feedback form, and any screenshot the user chooses to attach, are sent with that feedback.
- **Website content:** the org's Data Cloud metadata (object and field names) is cached locally. Query results are not stored.
- **Usage data:** none. No analytics.
- Certify: data is not sold, not used for unrelated purposes, and not used for creditworthiness or lending.

## Screenshots (1280x800, in `docs/store/`; the store takes at most five)

1. `1-profile.png`: a unified profile with its source record.
2. `2-identity.png`: a ruleset's rules and Compare two people.
3. `3-sql.png`: SQL with the objects panel, a join and results.
4. `4-objects.png`: the Individual DMO and what is mapped into it.
5. `5-segment.png`: a segment's criteria, counts, equivalent SQL and a membership check.

Taken on a developer org with sample data. The org domain and org ID are replaced, and the sample people and the Salesforce email in shot 2 are replaced with fictional ones.

## Store icon

`public/images/icon128.png` (a magnifier over a cloud). Small promo tile: `docs/store/promo-440x280.png` (drawn by `scripts/make-promo.py`).

## Privacy policy (published at the URL above; `site/public/privacy.html` is the source)

Data Cloud Inspector privacy policy

Data Cloud Inspector is a browser extension that reads data from the user's own Salesforce org.

What it accesses: the Salesforce session already in the browser, used to call the org the user is logged in to; the org's Data Cloud metadata and records, which it shows to the user.

What it stores, in the browser only: settings, saved queries and query history, and the org's Data Cloud metadata (object and field names). Records and query results are not stored.

What it sends: requests go only to the user's own Salesforce org. When the user chooses to send feedback, the message, optional name and email, an optional screenshot and optional technical details (version, page, org domain, recent API paths and statuses) are sent to the developer's feedback service. Nothing else is collected, and there is no analytics.

Data is not sold or shared with third parties.

Contact: the email address on the store listing.
