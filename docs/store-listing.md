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
- **Version.** Publish from a release zip in `releases/`, not a test zip, once the version is final.

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
- Copy the whole profile as Markdown.

SQL
- Run Data Cloud SQL against data lake objects, data model objects and calculated insights.
- Search your objects beside the editor and insert an object, a field, or a SELECT of the fields you tick.
- Autocomplete for every object and field in your org, Format, saved queries and history.
- Load results 1,000 rows at a time, download every row as CSV, or copy the results ready to paste into an AI assistant.

SEGMENTS
- Every segment with its status, schedule and member count.
- The criteria in plain words, and the equivalent SQL.
- Compare the count at the last publish, in the membership table, and matching the criteria now.
- Publish history.
- Check whether a person is in a segment, and which condition keeps them out.

HEALTH
- One page for data streams, identity resolution, calculated insights, segments and activations, problems first.
- Why each one needs a look: never ran, last run failed, no source profiles, overdue publish.
- Consolidation rate and profile counts per identity resolution ruleset.
- Copy the report as Markdown for a status update.

OBJECTS
- Every DLO, DMO and calculated insight with fields, API names, types, primary keys and key qualifiers.
- Relationships between objects.
- For a DMO: what is mapped into it, field by field, and the state of each data stream.
- For a DLO: its data stream and the DMOs it maps to.
- Row counts, a ready-made SELECT, and Copy as Markdown.

ALSO
- Open records in Salesforce: segments, data streams, DLOs, calculated insights, rulesets and CRM records link to their page in the org.
- REST explore with ready-made examples for the Data Cloud API.
- A connection check that shows which Data Cloud APIs your org answers.
- Light, dark or system theme.
- Send feedback with a screenshot you can mark up.

READ ONLY
Data Cloud Inspector never changes data or setup. It only reads, and the one kind of request it sends that is not a plain read is a Data Cloud SQL query. Your Salesforce session stays inside the extension and is sent only to your own org.

Data Cloud Inspector is an independent tool. It is not made by or affiliated with Salesforce.

## Category

Developer Tools

## Language

English

## Single purpose (Privacy practices tab)

Data Cloud Inspector lets Salesforce Data Cloud users inspect their own org, read only: look up unified profiles, debug segments, run Data Cloud SQL, and view the data model and how data flows into it.

## Permission justifications (Privacy practices tab)

- **cookies:** the extension calls the user's Salesforce org with the session they already have in this browser. It reads the Salesforce `sid` cookie of the org's own domain and sends it only to that org, as the API's authorization header. It also reads the cookie of the current Salesforce tab to know which org that tab belongs to. The session is never stored or sent anywhere else.
- **storage:** settings, saved queries, query history, and a cache of the org's Data Cloud metadata (object and field names) are stored locally in the browser.
- **unlimitedStorage:** the metadata cache is several hundred KB per org, and users who work in many orgs can pass the default local storage limit.
- **Host permissions:**
  - `https://*.salesforce.com/*`, `https://*.cloudforce.com/*`: the org's own API domain (`<my domain>.my.salesforce.com`), which the extension calls on the user's behalf, and where the session cookie lives.
  - `https://*.force.com/*`, `https://*.salesforce-setup.com/*`: Lightning and Setup pages. When the user clicks the toolbar icon on one of these tabs, the extension reads that tab's session cookie to open on the right org. Nothing is injected into these pages.
- **Remote code:** none. All code is in the package.

## Data usage (Privacy practices tab)

- **Authentication information:** yes. The Salesforce session cookie is read to call the user's own org, and is not stored or transmitted anywhere else.
- **Personally identifiable information:** yes, shown only. Profiles and query results display records from the user's org (names, emails, phones). They are not stored and not sent anywhere except between the browser and the user's own org. A name or email typed into the feedback form, and any screenshot the user chooses to attach, are sent with that feedback.
- **Website content:** the org's Data Cloud metadata (object and field names) is cached locally. Query results are not stored.
- **Usage data:** none. No analytics.
- Certify: data is not sold, not used for unrelated purposes, and not used for creditworthiness or lending.

## Screenshots (1280x800, in `docs/store/`)

1. `1-profile.png`: a unified profile with its source record.
2. `2-match-rules.png`: match rules with each record's values, and possible missed matches.
3. `3-sql.png`: SQL with a join and results.
4. `4-objects.png`: the Individual DMO and what is mapped into it.
5. `5-segment.png`: a segment's criteria, counts, equivalent SQL and a membership check.
6. `6-explore.png`: REST explore examples.

Taken on a developer org with sample data. The org domain and org ID are replaced, and the sample people who share an email in shot 2 are renamed to fictional names.

## Store icon

`public/images/icon128.png` (a magnifier over a cloud). The store also wants a 440x280 small promo tile (optional).

## Privacy policy (published at the URL above; `site/public/privacy.html` is the source)

Data Cloud Inspector privacy policy

Data Cloud Inspector is a browser extension that reads data from the user's own Salesforce org.

What it accesses: the Salesforce session already in the browser, used to call the org the user is logged in to; the org's Data Cloud metadata and records, which it shows to the user.

What it stores, in the browser only: settings, saved queries and query history, and the org's Data Cloud metadata (object and field names). Records and query results are not stored.

What it sends: requests go only to the user's own Salesforce org. When the user chooses to send feedback, the message, optional name and email, an optional screenshot and optional technical details (version, page, org domain, recent API paths and statuses) are sent to the developer's feedback service. Nothing else is collected, and there is no analytics.

Data is not sold or shared with third parties.

Contact: the email address on the store listing.
