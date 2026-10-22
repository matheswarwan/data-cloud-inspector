# Data Cloud Inspector

A read-only Chrome extension for Salesforce Data Cloud (Data 360). It uses the Salesforce
login you already have in the browser, so there is nothing to install in the org.

Status: early, test builds only.

## What it does

- SQL: run Data Cloud SQL against DLOs, DMOs and calculated insights, with table and field
  autocomplete from the org, Format, saved queries and history. Results load 1,000 rows at a
  time; Download CSV fetches every row (up to 500,000); Copy for AI copies the SQL, column
  types and the first 50 rows as Markdown.
- Objects: every DLO, DMO and calculated insight with fields, API names, types, primary keys
  and key qualifiers; relationships; for a DMO, the objects mapped to it field by field and
  their data streams; for a DLO, its data stream and the DMOs it maps to. Row counts, Query,
  Copy SELECT and Copy as Markdown.
- REST explore and a connection check (shareable report with response shapes only).

## Planned

- Profile inspector: look up a person and see the unified profile, the source records
  behind it and how identity resolution joined them, engagement, calculated insights and
  segment membership.
- Lineage beyond mappings: calculated insight, segment, activation.
- Segment debugger.
- Web tab for Personalization (decoded web SDK events linked to the profile).

## How it signs in

The same way Salesforce Inspector Reloaded does. The service worker reads the org's `sid`
cookie on its `my.salesforce.com` domain (the session on `lightning.force.com` has no API
access) and sends it as a Bearer token. The session never reaches the app page. Orgs are
told apart by the org ID at the start of the session, so several logged-in orgs work.

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
