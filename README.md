# Data Cloud Inspector

A read-only Chrome extension for Salesforce Data Cloud (Data 360). It uses the Salesforce
login you already have in the browser, so there is nothing to install in the org.

Status: early. The first build is a connection check and a REST explorer, used to confirm
which Data Cloud endpoints an org answers before the real features are built.

## Planned

- Profile inspector: look up a person and see the unified profile, the source records
  behind it and how identity resolution joined them, engagement, calculated insights and
  segment membership.
- SQL runner over data lake objects, data model objects and calculated insights.
- Metadata explorer: DMO fields and API names, relationships, DLO to DMO mappings.
- Lineage: data stream, DLO, DMO, calculated insight, segment, activation.
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
