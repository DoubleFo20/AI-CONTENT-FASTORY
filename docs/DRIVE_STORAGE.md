# Google Drive storage preparation and operating guide

STATUS: IMPLEMENTED_BACKUP_ADAPTER; DRIVE_PRIMARY_CUTOVER_PENDING

This guide describes the current server-side Google Drive adapter and the work required before Drive can become primary media storage. It does not indicate that Google OAuth has been authorized, that files have been uploaded, or that a Drive connection has been verified. The local clip/export store remains the working source of media today. The implemented Drive write is a deliberate, owner-authorized backup of one existing local media item at a time.

## Current integration boundary

The Express app registers these owner-authenticated endpoints under `/api`:

| Method and path | Behavior |
| --- | --- |
| `GET /integrations/capabilities` | Returns runtime capability state, including the owner’s Drive configuration/connection status. |
| `GET /integrations/drive/status` | Returns `{storage}` with provider, configured, connected, and state (`not_configured`, `disconnected`, `connected`, or `failed`). A local token check is not proof that a real upload has succeeded. |
| `POST /integrations/drive/authorize` | Requires CSRF and `{}`. Returns only `{authorizationUrl}` for the user-operated Google consent step. Treat the state-bearing URL as transient; do not log it. |
| `POST /integrations/drive/backups` | Requires CSRF and `{kind: "clips" | "exports", mediaId}`. Selects the media file by authenticated owner and ID, resolves only the app-managed local path, and uploads that item. |
| `GET /integrations/drive/files/:id` | Downloads a private app-managed Drive file after owner-bound metadata checks. The response is an attachment; the OAuth token is never returned. |
| `GET /integrations/drive/callback` | Public Google redirect endpoint. It validates a one-time state bound to the initiating owner and live session hash before and after token exchange. It redirects to the application after a successful callback. |

All API routes except the Google callback pass through the existing session and CSRF middleware. The callback does not depend on the application cookie: Google’s cross-site redirect may omit the app’s `SameSite=Strict` cookie. The adapter consumes state once, checks expiry, and validates that the original owner’s hashed session is still live both before exchanging the code and before persisting tokens. Pending states live only in process memory, so a server restart invalidates outstanding consent attempts; start authorization again after a restart.

The Drive adapter uploads only app-managed media. Backup lookup is owner-filtered before `managedPath` resolution. The Drive implementation marks uploaded files with an owner hash and `acfManaged=1`, rejects shared/trash/Shared Drive results, validates the configured parent folder when supplied, and checks the same ownership markers before download. It does not browse arbitrary user Drive content. No media index, automatic sync, replacement policy, Drive-first read path, or migration/cutover exists yet.

## Google Cloud Console preparation

1. Use a Google Cloud project controlled by the application owner and enable the Google Drive API.
2. Configure the OAuth consent screen and declare only the required `https://www.googleapis.com/auth/drive.file` scope. This scope is per-file access for files created/opened by the app or explicitly shared with it; it is intentionally narrower than whole-Drive access. The implementation does not request broad `drive` or `drive.readonly` scope.
3. Create an OAuth client of type **Web application**. Register the exact callback URI as an Authorized redirect URI. For local work, use an HTTP loopback URI; Google exempts localhost loopback from the HTTPS rule. For a deployed service, use an HTTPS URI on a domain the owner controls. Google requires the redirect URI to exactly match the registered value, including scheme, host, port, path, and trailing slash.
4. Set the same exact URI in `GOOGLE_REDIRECT_URI` and include that exact URI in `ACF_DRIVE_ALLOWED_REDIRECT_URIS`. The allowlist is comma-separated by the current configuration loader. The configured callback path must be `/api/integrations/drive/callback` on the same-origin Express service. The adapter rejects a configured redirect that is not allowlisted or that has userinfo, query, fragment, or unsafe encoded path characters.
5. Keep consent and redirect settings appropriate to the project’s current Google verification/testing status. User authorization must be granted in Google’s normal browser consent flow; the app does not automate Google sign-in or consent.

Google’s web-server OAuth guidance documents web application credentials, exact redirect URI matching, authorization-code exchange, offline access, and the `state` parameter. Google’s Drive scope guide recommends requesting the narrowest scope and explains the per-file behavior of `drive.file`. [OAuth 2.0 for Web Server Applications](https://developers.google.com/identity/protocols/oauth2/web-server), [Choose Google Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), and [OAuth 2.0 best practices](https://developers.google.com/identity/protocols/oauth2/resources/best-practices).

The adapter requests `access_type=offline`, `prompt=consent`, the single `drive.file` scope, state, and PKCE S256. Offline access is needed for the server to refresh access tokens after the browser consent flow; consent is requested in the explicit user-initiated authorization flow. The code rejects a successful token response without the expected scope or a refresh token. It preserves a prior refresh token only during a refresh grant, never while exchanging a new authorization code, to avoid mixing accounts/grants.

## Server environment configuration

Set these in a private process/service environment manager. Do not put secret values in source, client bundles, documentation, commits, issue text, or chat. Do not ask an operator to paste credentials into chat. Keep the existing local `.env`/environment policy unchanged; this guide does not authorize creating or changing environment files.

| Variable | Required | Meaning |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | Yes for configured Drive OAuth | Web application OAuth client ID. Keep server-side. |
| `GOOGLE_CLIENT_SECRET` | Yes | Client secret for that exact OAuth client. Keep server-side and private. |
| `GOOGLE_REDIRECT_URI` | Yes | Exact callback URI registered in Google Cloud Console and present in the allowlist. |
| `ACF_DRIVE_ALLOWED_REDIRECT_URIS` | Yes | Comma-separated exact redirect URI allowlist. Request headers and callback query values cannot select/change the redirect URI. |
| `ACF_TOKEN_ENCRYPTION_KEY` | Yes | Canonical Base64 encoding of exactly 32 random bytes. Decoder requires exactly 32 decoded bytes and a byte-for-byte canonical Base64 round trip. Missing, malformed, or wrong-length key leaves Drive unconfigured. |
| `GOOGLE_DRIVE_FOLDER_ID` | No | Optional destination folder ID. When set, the adapter verifies it resolves to a non-trashed, non-shared folder in the owner’s authorized Drive before upload. |

`server/index.ts` creates the adapter from the environment with private token storage beneath the application data directory and local clip/export roots as the only permitted upload roots. The encrypted vault key is operationally critical: preserve the same key across restarts and backups of the private vault. Losing or changing it makes existing tokens undecryptable and requires the owner to authorize Drive again. Store and back up the key separately from the encrypted vault, under the organization’s secret-management procedure.

On Windows, the vault code does not change ACLs. The operator must place the private Drive vault under a directory whose Windows ACL permits access only to the application owner/service identity and required administrators. Do not use a web-served or shared-user folder. On POSIX systems the implementation applies/checks owner-only directory/file modes (`0700`/`0600`); verify the actual deployment filesystem and mount behavior as part of host hardening. Do not treat encryption alone as a replacement for private filesystem access controls.

## Token handling and failure behavior

Tokens are stored server-side in an AES-256-GCM encrypted per-owner vault record. The filename is derived from a hash of the owner ID; the owner ID is also authenticated as additional data. Token plaintext is cleared from the in-memory buffer after vault operations. API responses expose no access/refresh token, OAuth client secret, vault path, or raw Google response body. The adapter uses fixed Google HTTPS endpoints, rejects redirects and unexpected hosts, bounds response sizes/time, and maps upstream failures to safe internal error codes.

Access tokens are refreshed on the server when needed. If Google rejects a refresh grant, the saved record is marked as requiring reauthorization; status can then be disconnected/failed, and the user must explicitly authorize again. Reauthorization creates a fresh grant; it is not silently mixed with a previous account’s refresh token. Revoking access or refresh-token expiry can invalidate the integration. A status value of `connected` means local credentials appear usable according to token/expiry metadata; it is not a successful live health check or a promise that a later upload will succeed.

Media limits and retry policy:

- A backup must be a managed clip/export owned by the authenticated user, between 1 byte and 128 MiB. The server never accepts an arbitrary client filesystem path.
- Files up to 5 MiB use a multipart upload. Larger files use resumable upload with 4 MiB chunks.
- An ambiguous/failed upload chunk is not automatically repeated. The request may have reached Google even if the client did not receive its result; automatic replay could create duplicate files. Surface a safe failure and require a deliberate owner action after checking Drive state. No background retry loop is implemented.
- Drive downloads are capped at 128 MiB and require a matching app-managed owner marker. Google Workspace-native documents and unrelated/shared files are rejected.
- Per-owner storage operations are serialized in-process. This is not a distributed lock and should not be represented as cross-instance coordination.

## Current storage and future Drive-primary cutover

The application’s existing local database and private file store remain active. The Drive backup route is an opt-in copy operation for a selected clip or export; it does not move or delete the local source, sync later changes, or make Drive the primary location. Local playback, imports, FFmpeg assembly, and exports continue to use the existing local paths.

Drive-primary status requires all of the following before product behavior can claim it:

1. Owner-provided OAuth configuration is installed through a private environment manager and the exact callback is registered/allowlisted.
2. A real owner consent grant succeeds with offline access and the requested `drive.file` scope. The application verifies live token refresh and a small controlled upload/download round trip; no credential presence or local `connected` flag substitutes for this check.
3. A reviewed media index maps each app-owned project/scene/media record to the Drive file ID, owner, size, checksum/version, and current storage state. The index and ownership transitions need an approved contract/schema and recovery behavior.
4. Read/write routing and cutover/rollback are designed so existing local files remain recoverable until each indexed Drive object is confirmed. Do not bulk-copy, delete, or migrate existing user media automatically.
5. UI status, sync/progress, conflict resolution, offline behavior, and backup recovery are implemented against that contract. The current backup endpoint is not that media catalog or synchronization contract.

No actual Google OAuth grant, real Drive upload/download, publishing operation, or Drive-primary cutover was performed for this checkpoint. Credentials, a successful owner grant, real upload verification, media index/cutover design, and operator filesystem ACL configuration remain external gates.

## Operational references

- `shared/integrations.ts`: public `DriveStatus` and capability shapes.
- `server/integrations.ts`: protected status/authorize/backup/private-download routes and callback session validation.
- `server/storage/types.ts`: scope, size limits, Drive errors, and integration contract.
- `server/storage/oauth.ts`: exact redirect allowlist, PKCE, state lifetime, session checks, refresh behavior.
- `server/storage/vault.ts`: encrypted owner-bound token records and filesystem permission checks.
- `server/storage/drive.ts`: environment loading, managed local-file validation, owner markers, multipart/resumable uploads, and private downloads.
