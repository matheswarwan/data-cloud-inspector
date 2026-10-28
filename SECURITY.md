# Security policy

Data Cloud Inspector is published by Ateko. It runs inside a logged-in Salesforce session, so we treat security reports as a priority.

## Reporting a vulnerability

Email **mathes.kanagarajan@cloudkettle.com** with "Data Cloud Inspector security" in the subject. Please include:

- the extension version (Settings, About) and browser version;
- what an attacker could do, and the steps to reproduce it;
- whether it needs a malicious page, another extension, or access to the user's machine.

Do not include real customer data, session IDs or tokens. If you need to show one, mask it.

We aim to acknowledge a report within 3 business days and to ship a fix for a confirmed high-severity issue within 14 days (Chrome Web Store review can add a few days). We will credit you in `CHANGELOG.md` unless you ask us not to.

Please do not open a public GitHub issue for a vulnerability.

## Supported versions

Only the latest version on the Chrome Web Store gets security fixes. Chrome updates extensions automatically; administrators can check the installed version in `chrome://extensions` or their Chrome management console.

## Scope

In scope: the extension's code in this repository (`src/`, `public/`), its build and release process, and the privacy policy site in `site/`.

Out of scope: Salesforce itself (report to Salesforce), diagramforce.com (a third-party site the user can choose to open), and issues that need an already compromised browser or machine.

## How the extension is built to be safe

See `docs/security-summary.md`: permissions and why each is needed, the authentication and token flow, what is stored, the network calls (only to the user's Salesforce org), the Content Security Policy, and the administrator policy. Security scans for each version are recorded in `security/audits/`.
