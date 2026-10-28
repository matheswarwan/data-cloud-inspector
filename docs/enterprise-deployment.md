# Deploying Data Cloud Inspector in an organization

For Chrome administrators (Google Admin console, Windows Group Policy, macOS configuration profiles, or Linux JSON policies). Version 1.0.8 and later.

Throughout, `EXTENSION_ID` is the extension's Chrome Web Store ID: the last part of its store URL, `https://chromewebstore.google.com/detail/data-cloud-inspector/EXTENSION_ID`.

## 1. Allow or force-install it

If your organization blocks extensions by default (`ExtensionInstallBlocklist: ["*"]`), add it to the allow list, or force-install it so users cannot remove it.

**Allow only:**

```json
{ "ExtensionInstallAllowlist": ["EXTENSION_ID"] }
```

**Force-install:**

```json
{ "ExtensionInstallForcelist": ["EXTENSION_ID;https://clients2.google.com/service/update2/crx"] }
```

In the Google Admin console: Devices, Chrome, Apps and extensions, Users and browsers, add from the Chrome Web Store by ID, then set Installation policy to Allow install or Force install.

## 2. Limit it to your own Salesforce org

Two layers; use both.

**Chrome enforces the host list** (`ExtensionSettings`). On blocked hosts the extension loses its host access, including cookie access, whatever its code does:

```json
{
  "ExtensionSettings": {
    "EXTENSION_ID": {
      "installation_mode": "force_installed",
      "update_url": "https://clients2.google.com/service/update2/crx",
      "runtime_blocked_hosts": ["*://*.my.salesforce.com", "*://*.cloudforce.com"],
      "runtime_allowed_hosts": ["*://acme.my.salesforce.com", "*://acme--uat.sandbox.my.salesforce.com"]
    }
  }
}
```

`runtime_allowed_hosts` wins over `runtime_blocked_hosts`, so the pair above means "only Acme's production org and its UAT sandbox". Replace `acme` with your My Domain name. Chrome's patterns allow a wildcard only as the first part of the host, so list each sandbox, or allow `*://*.sandbox.my.salesforce.com` if that is acceptable.

**The extension's own policy** (`allowedOrgDomains`, below) hides other orgs from the user and refuses OAuth logins to them, with a clear message instead of failed calls.

## 3. Extension policy (managed storage)

The extension reads these keys from `chrome.storage.managed` (schema: `public/managed_schema.json` in the package). Users see them under Settings, "Set by your administrator", and cannot change them.

| Key | Type | Default | Effect |
|---|---|---|---|
| `authMode` | `"session-or-oauth"` or `"oauth-only"` | `"session-or-oauth"` | `oauth-only`: never read the browser's Salesforce session cookie; users must use Log in with OAuth through your External Client App. |
| `allowedOrgDomains` | array of strings | `[]` (any org) | My Domain hosts allowed, exact (`acme.my.salesforce.com`) or by suffix (`*.sandbox.my.salesforce.com`, which also matches `acme--uat.sandbox.my.salesforce.com`). |
| `disableCache` | boolean | `false` | Org metadata caches and the Health result are kept only until the browser closes. |
| `disableQueryHistory` | boolean | `false` | No SQL run history (existing history is cleared). |
| `disableDiagramforce` | boolean | `false` | Open in Diagramforce (sends diagram names to diagramforce.com) is unavailable, even if a user turns it on. |
| `disableFeedbackUpload` | boolean | `false` | The Feedback form only opens an email in the user's mail app; nothing is posted to the developer's feedback service. |

**Google Admin console:** Apps and extensions, select the extension, "Policy for extensions", paste JSON (values only):

```json
{
  "authMode": { "Value": "oauth-only" },
  "allowedOrgDomains": { "Value": ["acme.my.salesforce.com", "*.sandbox.my.salesforce.com"] },
  "disableCache": { "Value": true },
  "disableQueryHistory": { "Value": true },
  "disableDiagramforce": { "Value": true },
  "disableFeedbackUpload": { "Value": true }
}
```

**Windows (registry):** under `HKEY_LOCAL_MACHINE\Software\Policies\Google\Chrome\3rdparty\extensions\EXTENSION_ID\policy`, string value `authMode` = `oauth-only`, DWORD `disableCache` = 1, and so on; `allowedOrgDomains` as a subkey with numbered string values (`1` = `acme.my.salesforce.com`).

**macOS:** a configuration profile for the domain `com.google.Chrome.extensions.EXTENSION_ID` with the same keys.

**Linux:** `/etc/opt/chrome/policies/managed/data-cloud-inspector.json`:

```json
{ "3rdparty": { "extensions": { "EXTENSION_ID": {
  "authMode": "oauth-only",
  "allowedOrgDomains": ["acme.my.salesforce.com"],
  "disableCache": true, "disableQueryHistory": true, "disableDiagramforce": true, "disableFeedbackUpload": true
} } } }
```

Check it on a user's machine: `chrome://policy` shows the extension's policy values; in the extension, Settings lists them.

## 4. OAuth only: create the External Client App

With `authMode: "oauth-only"`, users need an External Client App in each org:

1. Setup, External Client App Manager, New External Client App.
2. Enable OAuth. Callback URL: shown in the extension under Settings, Log in with OAuth (`https://EXTENSION_ID.chromiumapp.org/`).
3. OAuth scopes: **Manage user data via APIs (`api`)** and the Data Cloud scopes the users need (their names start with `cdp_`, for example `cdp_query_api` for SQL and `cdp_profile_api` for profiles). Do not add `refresh_token` / `offline_access`: the extension never keeps a refresh token, so it is not needed.
4. Require PKCE. No client secret is needed (the extension is a public client and never sends one).
5. Policies: set who may use it (admin-approved users, a permission set), IP relaxation and session timeout to your standards.
6. Give users the consumer key (client ID). They paste it once in Settings, Log in with OAuth.

You can see usage and revoke tokens in Setup, Connected Apps OAuth Usage, like any other client.

## 5. Version pinning and updates

Chrome Web Store extensions update automatically, and Chrome has no policy to pin an older store version. Options:

- **Review before rollout:** each release is tagged in the source repository with its SHA-256 and scan results (`security/audits/`, `CHANGELOG.md`). Review the changes, then leave the force-install in place.
- **Pin a reviewed build:** host the reviewed `.crx` yourself and point `ExtensionInstallForcelist` / `ExtensionSettings.update_url` at your own update manifest (`https://your-host/updates.xml`). Chrome then installs exactly that version until you change the manifest. A self-hosted copy has a different extension ID unless you also hold the signing key, so policies must use the ID of your copy.
- **Permission changes:** a version that asks for new permissions is disabled by Chrome until the user approves it (force-installed extensions get them without asking). Every release lists permission changes in `CHANGELOG.md`.

## 6. What users will see

- The first time, a tab with Home: the org they are logged in to, or a Log in prompt (OAuth only: a My Domain and client ID form).
- Settings, Storage: everything kept in the browser, with Delete.
- No data is sent outside your Salesforce org, except feedback a user chooses to send (turn it off with `disableFeedbackUpload`). See `PRIVACY.md` and `docs/security-summary.md`.
