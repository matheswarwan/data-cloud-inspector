# Release process

How a version of Data Cloud Inspector goes from `main` to the Chrome Web Store, and the controls along the way. Publisher: Ateko. Maintainer: the GitHub account `matheswarwan`.

## Accounts and credentials

- **Two-step verification everywhere**, with a hardware security key (or passkey) as the primary method: the GitHub account, the Google account that owns the Chrome Web Store publisher, and the Google Cloud project used for publishing. No SMS as a fallback where it can be avoided.
- **No shared credentials.** Nobody logs in to the publisher account with a shared password; the store API is reached through a service account with no stored key (Workload Identity Federation from GitHub Actions), so there is no secret in the repository or in GitHub's secrets store to leak.
- **Signed tags.** Every release tag is signed by the maintainer (SSH or GPG key added to GitHub as a signing key). The publish workflow refuses a tag that GitHub does not show as Verified.
- **Approval.** Publishing runs in the GitHub environment `release`, which needs the maintainer's approval each time.
- The Chrome Web Store dashboard login stays possible for listing text and the Privacy practices tab, which the API does not cover.

## Normal release

1. On `main`, with CI green: bump `version` in `public/manifest.json` and `package.json`, add the `CHANGELOG.md` entry (say whether permissions changed), commit, push.
2. Make a signed annotated tag and push it:
   ```
   git tag -s v1.0.8 -m "Data Cloud Inspector 1.0.8"
   git push origin v1.0.8
   ```
3. `release.yml` runs: checks the tag matches the manifest, runs the tests, builds twice and compares (reproducible), runs every scan, and makes a **draft** GitHub release with the zip, `.sha256` and `scan-report-<version>.md`.
4. Review the draft: scan report, permissions (the manifest guard fails CI on any unreviewed change), changelog. Commit the scan report as `security/scans/<version>.md`.
5. **Publish the draft release.** That starts `publish.yml`:
   - *verify* (no credentials): the tag is signed and Verified; rebuilding the tag gives exactly the zip on the release (SHA-256 of the `.sha256` file, the asset and the rebuild all match).
   - *publish*: waits for approval in the `release` environment, then uploads the zip and submits it for review through the Chrome Web Store API.
6. Store review passes (hours to days). Update the store's Privacy practices tab by hand if the data use changed (`docs/store-listing-checklist.md`).
7. Run **verify-store** (Actions, verify-store, Run workflow, tag `v1.0.8`): it downloads the CRX the store now serves and compares every file with the release zip. Commit its report as `security/store-diff/<version>.md`. Locally: `node scripts/verify-store.mjs <extension id> <zip> security/store-diff/<version>.md`.

Manual fallback (API not set up yet, or an emergency): upload the release zip in the dashboard. Steps 6 and 7 still apply, and the store diff proves the uploaded package is the reviewed one.

## One-time setup

### Signing key (maintainer)

```
ssh-keygen -t ed25519 -f ~/.ssh/git-signing -C "git signing"
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/git-signing.pub
git config --global tag.gpgSign true
gh ssh-key add ~/.ssh/git-signing.pub --type signing --title "git signing"
```

### Google Cloud: service account with Workload Identity Federation (no key file)

In a Google Cloud project owned by Ateko (`PROJECT_ID`, number `PROJECT_NUMBER`):

```
gcloud services enable chromewebstore.googleapis.com iamcredentials.googleapis.com sts.googleapis.com --project PROJECT_ID
gcloud iam service-accounts create cws-publisher --display-name "Chrome Web Store publisher (GitHub Actions)" --project PROJECT_ID
gcloud iam workload-identity-pools create github --location global --project PROJECT_ID
gcloud iam workload-identity-pools providers create-oidc data-cloud-inspector \
  --location global --workload-identity-pool github --project PROJECT_ID \
  --issuer-uri https://token.actions.githubusercontent.com \
  --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.environment=assertion.environment" \
  --attribute-condition "assertion.repository == 'matheswarwan/data-cloud-inspector' && assertion.environment == 'release'"
gcloud iam service-accounts add-iam-policy-binding cws-publisher@PROJECT_ID.iam.gserviceaccount.com --project PROJECT_ID \
  --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/matheswarwan/data-cloud-inspector"
gcloud iam service-accounts add-iam-policy-binding cws-publisher@PROJECT_ID.iam.gserviceaccount.com --project PROJECT_ID \
  --role roles/iam.serviceAccountTokenCreator \
  --member "principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/matheswarwan/data-cloud-inspector"
```

Only jobs in this repository's `release` environment can get a token, and only for this service account.

Then in the **Chrome Web Store Developer Dashboard**, Account: add the service account's email (`cws-publisher@PROJECT_ID.iam.gserviceaccount.com`) so it may manage the publisher's items. Note the **publisher ID** shown there.

### GitHub repository settings

Repository variables (Settings, Secrets and variables, Actions, Variables; none of these are secret):

| Variable | Value |
|---|---|
| `CWS_EXTENSION_ID` | the store item ID (32 letters, end of the listing URL) |
| `CWS_PUBLISHER_ID` | from the dashboard |
| `GCP_WIF_PROVIDER` | `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/data-cloud-inspector` |
| `GCP_SERVICE_ACCOUNT` | `cws-publisher@PROJECT_ID.iam.gserviceaccount.com` |

Environment, branch and tag protection (needs the repository to be public, or GitHub Pro). Run as the maintainer:

```
R=matheswarwan/data-cloud-inspector
# Environment "release": the maintainer approves every publish; only v* tags may deploy.
gh api -X PUT repos/$R/environments/release --input - <<'JSON'
{ "reviewers": [{ "type": "User", "id": 11278733 }], "prevent_self_review": false,
  "deployment_branch_policy": { "protected_branches": false, "custom_branch_policies": true } }
JSON
gh api -X POST repos/$R/environments/release/deployment-branch-policies -f name='v*' -f type=tag

# main: CI must pass, no force pushes or deletion. Admins may still push directly
# (the maintainer commits straight to main); everyone else needs a pull request.
gh api -X PUT repos/$R/branches/main/protection --input - <<'JSON'
{ "required_status_checks": { "strict": false, "contexts": [
    "Tests, build, manifest guard, retire.js", "Secrets in full history (gitleaks)",
    "Dependencies (npm audit, osv-scanner)", "Static analysis (semgrep)" ] },
  "enforce_admins": false, "required_pull_request_reviews": null, "restrictions": null,
  "allow_force_pushes": false, "allow_deletions": false, "required_linear_history": false }
JSON

# Version tags: only admins (the maintainer) create them; nobody moves or deletes them.
gh api -X POST repos/$R/rulesets --input - <<'JSON'
{ "name": "release tags", "target": "tag", "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/tags/v*"], "exclude": [] } },
  "rules": [ { "type": "creation" }, { "type": "update" }, { "type": "deletion" }, { "type": "non_fast_forward" } ],
  "bypass_actors": [ { "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" } ] }
JSON
```

Also on: secret scanning with push protection, Dependabot alerts and security updates, private vulnerability reporting (`SECURITY.md`).

## Supply chain rules

- `package-lock.json` is committed; CI and releases use `npm ci` (exact versions from the lockfile).
- GitHub Actions are pinned to full commit SHAs, with the version in a comment; Dependabot proposes updates. Scanner binaries are pinned by version and SHA-256.
- Workflows get a read-only token by default; only the release job may write (to create the draft release), and only the publish job may request a Google token.
- No `pull_request_target`, no secrets in pull request workflows.
- New permissions, hosts, CSP changes, URL hosts in the bundle or source files with network calls fail CI until `security/manifest-baseline.json` is updated in a reviewed change.
