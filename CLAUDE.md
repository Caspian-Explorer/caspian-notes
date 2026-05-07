# Caspian Notes — Claude Code Instructions

## Global Rules

- **Do NOT include `Co-Authored-By` lines in commit messages.** Never add co-author trailers for Claude or any AI assistant.
- **After every task, complete ALL post-task steps.** Every code change requires:
  1. **Version bump** — increment `package.json` version, update `CHANGELOG.md`, run `npm install` to sync lock file.
  2. **Documentation updates** — update all affected docs: `README.md`, `ARCHITECTURE.md`, `BUILD.md`, `SETUP_GUIDE.md`, `QUICKSTART.md`, `START_HERE.md`, `THREAT_MODEL.md`, and `package.json` description.
  3. **Build VSIX** — run `vsce package` to produce a new `.vsix` with the incremented version number. Confirm it packages without errors.
  4. **Commit** — stage all changed files and commit with a descriptive message following the Pre-Commit Checklist below (lint, compile, review, tag, push, release, discussion post).
  5. **Notify the user** — always tell the user the new version number and confirm the VSIX was built successfully. Never silently skip this.
  Never skip these steps. They apply to every task, no matter how small. If you forget any step, go back and complete it before moving on.

## Pre-Commit Checklist

Before every `git commit`, follow these steps **in order**. Do not skip any step. If a step fails, fix the issue and re-run from that step before continuing.

### 1. Lint
```
npm run lint
```
Fix all linting errors. Never use `--no-verify` to bypass lint failures.

### 2. Compile
```
npm run compile
```
Fix all TypeScript compilation errors before proceeding.

### 3. Review Changed Files
Review all staged and modified files for:
- Accidental debug code (`console.log`, `debugger`, leftover `TODO`/`FIXME` comments)
- Hardcoded secrets, credentials, or API keys
- Unused imports or dead code introduced by the changes

If any issues are found, fix them before proceeding.

### 4. Bump Version
Increment the version number for every commit:

1. **`package.json`** — bump the `version` field (patch by default; minor for new features, major for breaking changes).
2. **`CHANGELOG.md`** — add a new `## [X.Y.Z] - YYYY-MM-DD` heading above the previous version.
3. Run `npm install` to sync `package-lock.json` with the new version.

### 5. Update Documentation
Update **all** documentation affected by the changes:

1. **CHANGELOG.md** — add entries under the current version heading using the existing format (`### Added`, `### Changed`, `### Fixed`).
2. **Review and update** any of these docs if the changes affect their content:
   - `README.md` — user-facing extension documentation / marketplace listing
   - `ARCHITECTURE.md` — system design and component descriptions
   - `BUILD.md` — build and development instructions
   - `SETUP_GUIDE.md` — deployment and configuration guide
   - `QUICKSTART.md` — quickstart guide
   - `START_HERE.md` — documentation index
   - `THREAT_MODEL.md` — update if the change affects the attack surface or adds a new trust boundary
3. **package.json** `description` field — update if the extension's capabilities changed.

### 6. Verify Packaging
```
vsce package
```
Confirm the extension packages into a `.vsix` without errors. Keep the `.vsix` file locally — it is needed for marketplace submission. It is already gitignored (`*.vsix`) so it will not be committed.

### 7. Commit
Create the commit with a descriptive message in imperative mood (e.g., "Add send-to-chat fallback" not "Added send-to-chat fallback"). Do **not** include `Co-Authored-By` trailers.

### 8. Tag
Create an annotated git tag for the new version:
```bash
git tag -a vX.Y.Z -m "vX.Y.Z — <short summary>"
```

### 9. Push
Push the commit and tag to the remote:
```bash
git push origin main --tags
```

### 10. Create GitHub Release
Create a GitHub Release with the `.vsix` attached:
```bash
gh release create vX.Y.Z caspian-notes-X.Y.Z.vsix \
  --title "vX.Y.Z — <short summary>" \
  --notes "<changelog entries for this version>"
```

### 11. Post to GitHub Discussions
After every commit, create a GitHub Discussion in the **Announcements** category. The post must be **social-media-ready** — the user should be able to copy-paste it directly to Twitter/X, LinkedIn, etc.

**Format requirements:**
- **Title:** action-oriented, attention-grabbing, under 100 characters (e.g., "Caspian Notes adds send-to-chat fallback").
- **Body:** 2-4 bullet points of what's new, a one-liner value prop, and the VS Code Marketplace link.
- **Always include the Marketplace link:** https://marketplace.visualstudio.com/items?itemName=CaspianTools.caspian-notes
- Keep it short and punchy — 1-3 sentences for the intro, then bullets.

**Create via GraphQL API:**

> **Repository ID and Announcements category ID are filled in below.** Discussions are enabled on `CaspianTools/caspian-notes` and the Announcements category ID is `DIC_kwDOSLnYT84C7q_V`. The lookup query is preserved below for re-discovery if categories are ever rotated.

```bash
# Fetch the Announcements category ID (run once after enabling Discussions):
gh api graphql -f query='
  query {
    repository(owner: "CaspianTools", name: "caspian-notes") {
      id
      discussionCategories(first: 10) { nodes { id name } }
    }
  }
'

gh api graphql -f query='
  mutation {
    createDiscussion(input: {
      repositoryId: "R_kgDOSLnYTw",
      categoryId: "DIC_kwDOSLnYT84C7q_V",
      title: "<TITLE>",
      body: "<BODY>"
    }) {
      discussion { url }
    }
  }
'
```
