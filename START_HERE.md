# Caspian Notes — Start Here

## What you have

A VS Code extension that stores notes as Markdown files and displays them in an Instagram-style masonry grid (with a Google Keep-style list-view toggle).

## If you want to…

- **Install it** → `README.md` → *Install*
- **Try it in 5 minutes** → `QUICKSTART.md`
- **Understand the code** → `ARCHITECTURE.md`
- **Build / publish** → `BUILD.md`
- **Configure settings** → `SETUP_GUIDE.md`
- **Report a vulnerability** → `SECURITY.md`
- **See the threat model** → `THREAT_MODEL.md`
- **See what changed** → `CHANGELOG.md`

## Three-step first run

```bash
npm install
npm run compile
# open in VS Code, press F5, then run "Caspian Notes: Open Notes Library"
```

## Project at a glance

| Area | Value |
|---|---|
| Source files | 5 (TypeScript) |
| Webview assets | 3 (JS + CSS + SVG icon) |
| Commands | 10 (3 top-level + refresh + 6 per-item) |
| Settings | 3 |
| Storage | `context.globalStorageUri/notes/*.md` |
| Dependencies | 1 runtime (`gray-matter`) |
