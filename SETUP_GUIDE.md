# Caspian Notes — Setup & Deployment

## What's included

- VS Code extension source (`src/`) — TypeScript, compiles to `out/`.
- Webview assets (`media/`) — masonry grid UI (HTML/CSS/JS).
- Build & publish scripts in `package.json`.

## Local install from VSIX

```bash
vsce package
code --install-extension caspian-notes-1.0.0.vsix
```

## Marketplace install

```
ext install CaspianTools.caspian-notes
```

## Configuration reference

| Setting | Type | Default | Description |
|---|---|---|---|
| `caspianNotes.defaultCardAction` | enum `copy`/`insert`/`edit` | `copy` | Action run when a card is clicked. |
| `caspianNotes.chatCommand` | string | `workbench.action.chat.open` | Command invoked by the **Chat** card action. |
| `caspianNotes.minColumnWidth` | number (180-600) | `260` | Minimum masonry column width in pixels. |

Example `settings.json`:

```json
{
  "caspianNotes.defaultCardAction": "insert",
  "caspianNotes.minColumnWidth": 320
}
```

## Storage location

Notes are stored at `context.globalStorageUri/notes/*.md`. Paths per OS:

- **Windows:** `%APPDATA%\Code\User\globalStorage\caspiantools.caspian-notes\notes\`
- **macOS:** `~/Library/Application Support/Code/User/globalStorage/caspiantools.caspian-notes/notes/`
- **Linux:** `~/.config/Code/User/globalStorage/caspiantools.caspian-notes/notes/`

## Backup / transfer

Copy the `notes/` folder between machines. Each `.md` file is self-contained.

## Troubleshooting

| Problem | Fix |
|---|---|
| Panel is blank / no notes render | Open the developer tools via `Developer: Open Webview Developer Tools` and check the console. |
| **Chat** action does nothing | The command ID in `caspianNotes.chatCommand` is wrong for your installed chat extension. On failure, the body is copied to the clipboard. |
| Search doesn't find a note | Search is case-insensitive substring — verify the term really appears in title / body / tags. |
| Notes vanished after switching machines | `globalStorageUri` is not synced by VS Code Settings Sync. Copy `notes/` manually (see **Backup / transfer**). |

## Release checklist

See `CLAUDE.md` — the 11-step pre-commit / release checklist is the authoritative workflow.
