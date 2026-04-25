# Caspian Notes — Build & Development

## Prerequisites

- Node.js 18+ (20 recommended)
- npm 9+
- VS Code 1.85+
- (for publishing) `vsce`, `ovsx` installed globally

## Setup

```bash
git clone https://github.com/Caspian-Explorer/caspian-notes.git
cd caspian-notes
npm install
npm run compile
```

## Run in debug

Open the repo in VS Code and press **F5** to launch an Extension Development Host. Run `Caspian Notes: Open Notes Library` from the command palette in the new window.

## Watch mode

```bash
npm run watch
```

Keeps `tsc` running on file change. Reload the dev host window (`Ctrl/Cmd + R` inside the dev host) to pick up changes.

## Lint

```bash
npm run lint
```

## Package

```bash
vsce package
```

Produces `caspian-notes-<version>.vsix`. The file is gitignored.

## Publish

```bash
# VS Code Marketplace
vsce login CaspianTools
vsce publish

# Open VSX
ovsx publish -p "$OVSX_TOKEN"
```

## Project structure

```
caspian-notes/
├── src/
│   ├── extension.ts        # activate / command registration
│   ├── notePanel.ts        # webview panel singleton
│   ├── noteStore.ts        # fs CRUD + frontmatter
│   ├── noteTreeProvider.ts # sidebar tree view
│   └── types.ts            # Note + message protocol
├── media/
│   ├── favicon.svg         # activity-bar glyph
│   ├── main.js             # webview client
│   └── styles.css          # masonry + editor styles
├── out/                    # tsc output (gitignored)
├── icon.png
├── package.json
├── tsconfig.json
└── .eslintrc.json
```

## Adding features

- **New card action** — extend `CardAction` in `src/types.ts`, handle it in `NotePanel.handleAction`, and add a button in `media/main.js` `renderCard`.
- **New setting** — add it under `contributes.configuration.properties` in `package.json` and read it with `vscode.workspace.getConfiguration('caspianNotes')`.
