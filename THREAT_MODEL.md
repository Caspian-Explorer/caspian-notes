# Caspian Notes — Threat Model

| Version | Date | Notes |
|---|---|---|
| 0.1.0 | 2026-04-24 | Initial model. |
| 0.4.0 | 2026-04-25 | Renamed from "Caspian Prompt"; storage paths and class names updated. |
| 1.3.4 | 2026-04-25 | Refined §C (textContent invariant restored after the static-`innerHTML` callsites for the empty-state heading and the pin-button SVG were converted to `createElement`/`createElementNS`); added §F covering the markdown-preview rendering surface introduced in 1.3.0. |

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
- *Mitigation:* all note text is rendered via `textContent` (never `innerHTML`), and a strict CSP (`script-src 'nonce-…' webview.cspSource`; `default-src 'none'`; `img-src webview.cspSource data:`) prevents any inline/remote script execution, `on*` event handlers, `javascript:` URIs, remote images, and iframes even if a sink slipped in. Inline SVG decoration (e.g. the pin button) is built via `createElementNS`, never via HTML string concatenation.
- *Out of scope for this defense:* the markdown-preview pane — see §F.

**D. Filesystem path traversal**

- *Threat:* crafted `id` in frontmatter escapes the storage directory on read/write.
- *Mitigation:* `id` is always set server-side via `crypto.randomUUID()`; on write, we compose the path from `path.join(dir, id + '.md')`. On read, we iterate `readdir` results — the filename is never user-controlled.

**E. Dependency compromise**

- *Threat:* `gray-matter` or a transitive dependency ships a backdoor.
- *Mitigation:* pinned minor range in `package.json`. We run no code at install time (no postinstall scripts in our own package). We do not execute user input as code.

**F. Markdown preview HTML injection**

- *Threat:* a note body containing raw HTML (e.g. `<script>`, `<img onerror=…>`, `<a href="javascript:…">`, `<iframe src=…>`) reaches the editor's Markdown preview pane via `marked.parse(body)` → `innerHTML`. Marked passes raw HTML through to its output by default (the legacy `sanitize` option was removed in v9). The note body in question may have been imported from an untrusted .md file or library JSON.
- *Mitigation:* the webview CSP blocks every JavaScript sink such markup could open. `script-src 'nonce-X' webview.cspSource` requires a nonce on every executable script — inline `<script>` tags injected via markdown have no nonce and never execute. The same directive blocks inline `on*` event handlers and `javascript:` URIs (both require `unsafe-inline`). `default-src 'none'` blocks `<iframe>` entirely. `img-src webview.cspSource data:` blocks remote image loads, neutralizing tracking pixels and the `<img onerror>` exfil pattern. The preview is therefore safe under the current CSP without a runtime sanitizer (DOMPurify, sanitize-html).
- *Residual risk:* the preview can render visible HTML (formatting, links, lists). A hostile note could draw a fake "Save your password to unlock" UI. We accept this — the user wrote or imported the note themselves, and the same risk exists for any markdown-rendering tool.
- *Tested by:* CSP review on every release. If the CSP in `notePanel.ts` is ever loosened to add `'unsafe-inline'` to `script-src` or to broaden `default-src`, this mitigation must be re-evaluated and a runtime sanitizer added.

## Known residual risks

- **No content-at-rest encryption.** An attacker with filesystem access to `globalStorageUri` reads notes in cleartext. Treat this the same as any other local VS Code state (snippets, history). Full-disk encryption is the recommended mitigation.
- **No sync.** `globalStorageUri` is not synced by VS Code Settings Sync. Users who copy the folder manually take responsibility for protecting it in transit.
- **Chat-command side effects.** When the user invokes **Chat**, the extension transfers the note body to the configured command. What happens next is outside our control.

## Assumptions

- The user trusts the VS Code process and the extensions they install.
- The user's filesystem is not shared with untrusted users.
- The VS Code webview API enforces CSP and `localResourceRoots` as documented.
