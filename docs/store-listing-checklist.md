# Chrome Web Store: checklist for the publisher

What to set in the Developer Dashboard so that the listing matches the repository and passes an enterprise review (Spin.AI and similar scanners read these fields). Do it with the 1.0.8 upload.

## Account (Developer Dashboard, Account / Settings)

- [ ] **Publisher display name:** `Ateko`. This is the "Offered by" line on the listing; it was blank. If the account is a group publisher, set it on the group.
- [ ] **Verified publisher:** verify the domain `ateko.com` (Account, Verify, add the TXT record) so the listing shows the verified badge. Ask whoever runs Ateko's DNS.
- [ ] **Contact email:** `mathes.kanagarajan@cloudkettle.com` (verified in the dashboard). This is the developer email the listing shows. Use the same address in `PRIVACY.md`, `SECURITY.md` and `src/lib/contact.js`; change all four together if it changes.
- [ ] **Trader status (EU):** declare as a trader for Ateko if the account is a business account; fill the address and phone the dashboard asks for.
- [ ] **2-step verification** on the Google account that owns the publisher, preferably a hardware key. No shared passwords.

## Item: Store listing tab

- [ ] **Description:** unchanged, but end with: "Published by Ateko. Read only; calls only your own Salesforce org. Privacy policy and security summary: see the links below."
- [ ] **Homepage URL:** the public repository once it is public (`https://github.com/matheswarwan/data-cloud-inspector`), else `https://data-cloud-inspector.mathes.dev/privacy`.
- [ ] **Support URL:** the repository's issues page once public, else `mailto:mathes.kanagarajan@cloudkettle.com`.
- [ ] **Screenshots:** no real customer data (the current ones use a developer org with masked names).

## Item: Privacy practices tab

- [ ] **Privacy policy URL:** `https://data-cloud-inspector.mathes.dev/privacy` (built from `PRIVACY.md`). The listing pointed at an ateko.com page before; if Ateko prefers its own domain, publish `site/public/privacy.html` there and use that URL, but keep only one.
- [ ] **Single purpose:** from `docs/store-listing.md`.
- [ ] **Permission justifications:** paste from `docs/store-listing.md` (cookies, storage, identity, activeTab, host `*.my.salesforce.com`). Remove the old `unlimitedStorage` and `*.force.com` texts: the dashboard keeps them otherwise.
- [ ] **Remote code:** "No, I am not using remote code."
- [ ] **Data usage**, tick exactly:
  - Personally identifiable information: yes (records shown from the user's org; Bulk lookup and Compare results kept until the browser closes).
  - Authentication information: yes (Salesforce session cookie and optional OAuth token, sent only to the user's org).
  - Website content: yes (org metadata cached locally).
  - Health, financial, personal communications, location, web history, user activity: no.
  - The three certifications (not sold, not used for unrelated purposes, not used for creditworthiness).

## Item: Distribution

- [ ] Visibility: keep Unlisted while clients review it, or Public; enterprise force-install works either way.
- [ ] Note the item ID (the last part of the listing URL) in `docs/enterprise-deployment.md` examples if you want to replace `EXTENSION_ID`.

## After publishing

- [ ] Record the live version in `CHANGELOG.md` and `security/audits/`.
- [ ] Ask Spin.AI (or the client's scanner) to rescan, and add the new score to `security/audits/README.md`.
