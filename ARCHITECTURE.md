# Caspian Notes — Architecture

## System overview

```
┌──────────────────────────────────────────┐
│  VS Code Extension Host (Node)           │
│  ┌────────────┐    ┌───────────────────┐ │
│  │ extension  │────│  NoteStore        │ │
│  │ .ts        │    │  fs + frontmatter │ │
│  │ commands   │    │  globalStorageUri │ │
│  └─────┬──────┘    └───────────────────┘ │
│        │                                 │
│  ┌─────▼──────────────┐                  │
│  │  NotePanel         │                  │
│  │  WebviewPanel      │                  │
│  └─────┬──────────────┘                  │
└────────┼─────────────────────────────────┘
         │ postMessage (JSON)
┌────────▼─────────────────────────────────┐
│  Webview (HTML/CSS/JS in media/)         │
│  - Masonry grid (CSS columns)            │
│  - Search bar + tag chips                │
│  - Edit modal                            │
└──────────────────────────────────────────┘
```

## Components

| File | Responsibility |
|---|---|
| `src/extension.ts` | Activation, command registration (top-level + per-item), QuickPick insert flow, shared action dispatch for tree commands. |
| `src/types.ts` | `Note` interface, host↔webview message protocol. |
| `src/noteStore.ts` | Async CRUD over `globalStorageUri/notes/*.md`, gray-matter (de)serialization, change notifier. |
| `src/notePanel.ts` | Singleton `WebviewPanel` — renders HTML with CSP + nonce, dispatches webview messages, performs clipboard / editor / chat actions. |
| `src/noteTreeProvider.ts` | `TreeDataProvider` for the `caspianNotesList` sidebar view; refires on store change. |
| `media/favicon.svg` | Activity-bar glyph. |
| `media/styles.css` | Masonry (CSS columns), cards, tag chips, editor modal, list-view variant. |
| `media/main.js` | Client-side render, search, tag filtering, editor modal, grid/list view toggle. |

## Note model

```ts
interface Note {
  id: string;          // uuid, filename stem
  title: string;
  body: string;
  tags: string[];      // lowercased, deduplicated
  createdAt: string;   // ISO
  updatedAt: string;   // ISO, bumped on every update
}
```

Serialized as `<globalStorage>/notes/{id}.md` with YAML frontmatter (see `README.md`).

## Message protocol

**Host → Webview**

- `{ type: 'init', notes, defaultAction, minColumnWidth }` — initial state.
- `{ type: 'updated', notes }` — emitted when the store changes.
- `{ type: 'toast', message, level }` — ephemeral notification.
- `{ type: 'focusNew' }` / `{ type: 'focusEdit', id }` — open the editor in new or edit mode.

**Webview → Host**

- `{ type: 'ready' }` — sent on load; host responds with `init`.
- `{ type: 'action', action, id }` — copy / insert / edit / sendToChat (edit is handled client-side).
- `{ type: 'create', draft }` / `{ type: 'update', id, patch }` / `{ type: 'delete', id }`.

## Security

- Webview runs with a strict CSP: `default-src 'none'`, per-load script nonce, styles/images/fonts only from `webview.cspSource`, no inline scripts.
- `localResourceRoots` is limited to the extension's `media/` folder.
- Extension makes no network requests. Notes never leave the machine unless the user invokes the **Chat** action, which forwards the body to another VS Code command (configurable).

## Performance notes

- Render is O(N) where N = number of notes. With substring search + tag filter it's O(N × L) where L = average body length. Fine for libraries up to several thousand notes; fuzzy search is a deferred enhancement.
- Masonry is pure CSS (`column-width`), no JS layout library.
