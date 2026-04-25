# Caspian Notes — Threat Model

| Version | Date | Notes |
|---|---|---|
| 0.1.0 | 2026-04-24 | Initial model. |
| 0.4.0 | 2026-04-25 | Renamed from "Caspian Prompt"; storage paths and class names updated. |

## Assets

| Asset | Why it matters |
|---|---|
| Note content | May contain trade secrets, customer-identifying context, credentials copy-pasted into a template, or personal writing the user wants private. |
| Note metadata | Titles and tags can leak intent even when bodies are encrypted at rest. |
| Extension storage path | Writable location inside VS Code's global storage; must not be abused to write outside of it. |

## Trust boundaries

1. **Extension host ↔ Webview** — webview runs untrusted-UI-style in its own origin; communicates only via `postMessage`.
2. **Extension ↔ Filesystem** — reads/writes `.md` files under `context.globalStorageUri/notes/`.
3. **Extension ↔ Other extensions** — the **Chat** action invokes a user-configured command; the receiving extension is outside this threat model.

## Adversaries & mitigations

**A. Malicious workspace / repo**

- *Threat:* the repo opened in VS Code tries to exfiltrate notes via a malicious configuration file.
- *Mitigation:* notes live in `globalStorageUri`, not in the workspace. Workspace-level settings cannot read or write there.

**B. Compromised chat extension**

- *Threat:* user misconfigures `chatCommand` to point at a malicious extension that logs the note body.
- *Mitigation:* the command ID is an explicit user setting with a documented default. We do not invoke anything else automatically.

**C. Webview XSS**

- *Threat:* a note body containing script tags is rendered unsanitized and executes inside the webview.
- *Mitigation:* all note text is rendered via `textContent` (never `innerHTML`), and a strict CSP (`script-src 'nonce-…'`) prevents any inline/remote script execution even if a sink slipped in.

**D. Filesystem path traversal**

- *Threat:* crafted `id` in frontmatter escapes the storage directory on read/write.
- *Mitigation:* `id` is always set server-side via `crypto.randomUUID()`; on write, we compose the path from `path.join(dir, id + '.md')`. On read, we iterate `readdir` results — the filename is never user-controlled.

**E. Dependency compromise**

- *Threat:* `gray-matter` or a transitive dependency ships a backdoor.
- *Mitigation:* pinned minor range in `package.json`. We run no code at install time (no postinstall scripts in our own package). We do not execute user input as code.

## Known residual risks

- **No content-at-rest encryption.** An attacker with filesystem access to `globalStorageUri` reads notes in cleartext. Treat this the same as any other local VS Code state (snippets, history). Full-disk encryption is the recommended mitigation.
- **No sync.** `globalStorageUri` is not synced by VS Code Settings Sync. Users who copy the folder manually take responsibility for protecting it in transit.
- **Chat-command side effects.** When the user invokes **Chat**, the extension transfers the note body to the configured command. What happens next is outside our control.

## Assumptions

- The user trusts the VS Code process and the extensions they install.
- The user's filesystem is not shared with untrusted users.
- The VS Code webview API enforces CSP and `localResourceRoots` as documented.
