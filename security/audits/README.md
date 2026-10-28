# Security audits and scans

One file per reviewed build, named `<version>-<short commit>.md` (for example `1.0.7-0b0cf86.md`), where the commit is the one the store zip was built from. A file for an unreleased commit uses `unreleased-<short commit>.md`. Each file starts with the version, the full commit hash, the date, who ran it and with which tools, and the SHA-256 of the zip when there is one.

## Labels

- **Automated, NOT independent:** scans and reviews the publisher ran itself (gitleaks, semgrep, npm audit, osv-scanner, retire.js, manual code reading by the developer or an AI assistant). Useful evidence, but not an audit. Every such file says so at the top.
- **Independent:** a review by someone outside the publisher (a client's security team, a third-party firm). Add it as its own file, with the reviewer's name, scope and date, and link their report if it may be shared.

## External ratings

Third-party extension risk ratings, before and after changes. Add a row per reading; keep the scanner's own wording.

| Date | Scanner | Version scanned | Score / rating | Notes |
|---|---|---|---|---|
| 2026-10-27 | Spin.AI | 1.0.7 | 26, low (5 users). Permissions: critical (cookies, identity), high (storage, unlimitedStorage); hosts broad; external comms medium; vulnerabilities medium; business operation risk medium | Before the 1.0.8 least-privilege changes. Store listing then showed a cloudkettle.com email, an ateko.com privacy policy and a blank "offered by". |
| | Spin.AI | 1.0.8 | (to fill in after the store update) | |

## Files

- `1.0.7-0b0cf86.md`: Phase 1 audit of the store version 1.0.7 (automated, NOT independent), and what 1.0.8 changed.
