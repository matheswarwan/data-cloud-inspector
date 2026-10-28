# Data Cloud Inspector: privacy policy

Last updated 28 October 2026. Applies to version 1.0.8 and later; changes from earlier versions are listed at the end.

Data Cloud Inspector is a browser extension published by **Ateko**. It reads data from the user's own Salesforce org so that the user can inspect Salesforce Data Cloud: profiles, segments, SQL queries, the data model and its health. It only reads; it never changes data or setup in the org.

## What it accesses

- **The Salesforce session already in the browser.** The extension's background worker reads the `sid` cookie of the org's own My Domain (`*.my.salesforce.com`) each time it makes a call, and uses it to call that org as the logged-in user. It is not stored, and it is sent only to that org. An administrator can turn this off (OAuth only).
- **Optionally, an OAuth access token**, when the user chooses Log in with OAuth. The login happens in the org's own Salesforce login window, through the org's External Client App. The token is kept in the browser's session storage until the browser closes or the user logs out (which also revokes it in Salesforce), and is sent only to that org. A refresh token is never kept.
- **The org's Data Cloud metadata and records**, which the extension shows to the user. This can include personal data held in the org, such as names, email addresses and phone numbers.

## What it stores

Only in the user's browser:

- settings (for example the theme and page layouts);
- saved SQL queries and the history of queries run (the SQL text, which can contain values the user typed, such as an email address in a filter);
- the list of orgs the user connected to: each org's domain and ID, the username that connected and a name the user may give it (no session or password);
- a cache of the org's Data Cloud metadata: object and field names, relationships, mappings, and the result of the Health check (statuses, no records);
- until the browser closes only: the last Bulk lookup and Compare results, which contain records of people from the org, and any OAuth access token.

No other records or query results are stored. The user can see and delete everything in the extension's Settings page (Storage), or by removing the extension. An administrator can turn off the cache and the query history by policy.

## What it sends

- The extension's only network calls go to the user's own Salesforce org. Its Content Security Policy blocks calls anywhere else.
- **Open in Diagramforce** is off unless the user turns it on in Settings, and an administrator can block it. When on, and only when the user clicks it on a data model or data stream diagram, the diagram's object names, field names and relationships (no records and no session) are handed to diagramforce.com, a free diagram editor run by a third party, which opens in a new tab.
- **Feedback**: the extension sends none itself. The Feedback form opens an email in the user's own mail app (or copies the text) with what the user wrote and, if ticked, technical details: extension version, page, the org's domain and API version, and the paths and statuses of recent API calls. The user decides whether to send it.

There is no analytics, telemetry or tracking. Nothing is collected in the background.

## Sharing

Data is not sold, and is not shared with third parties, apart from the diagram the user chooses to open in Diagramforce. It is not used for advertising, for creditworthiness or lending, or for any purpose other than the extension's features.

## Administrators

Organizations can manage the extension through Chrome policy: install it for their users, restrict it to their own org domains, allow OAuth only, and turn off the cache, query history and Diagramforce. See `docs/enterprise-deployment.md` in the source repository.

## Changes from earlier versions

- **1.0.7 and earlier** also kept the last Bulk lookup and Compare results in the browser's local storage after the browser closed (version 1.0.8 deletes them when it is installed); sent feedback, when the user chose to, to the developer's feedback service on Cloudflare (the message, optional name, email, screenshot and technical details); and offered Open in Diagramforce without the Settings switch.

## Contact

Ateko, mathes.kanagarajan@cloudkettle.com. Security issues: see `SECURITY.md` in the source repository, or email the same address.

Data Cloud Inspector is an independent tool. It is not made by or affiliated with Salesforce.
