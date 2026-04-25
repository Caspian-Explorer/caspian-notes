import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { NoteStore } from './noteStore';
import { ActionPresenter, performAction } from './noteActions';
import { CardAction, HostToWebview, WebviewToHost } from './types';

export class NotePanel {
    private static instance: NotePanel | undefined;

    static createOrShow(
        context: vscode.ExtensionContext,
        store: NoteStore,
        focus?: 'new' | { editId: string },
    ): NotePanel {
        if (NotePanel.instance) {
            NotePanel.instance.panel.reveal();
            if (focus === 'new') {
                NotePanel.instance.post({ type: 'focusNew' });
            } else if (focus && 'editId' in focus) {
                NotePanel.instance.post({ type: 'focusEdit', id: focus.editId });
            }
            return NotePanel.instance;
        }
        const panel = vscode.window.createWebviewPanel(
            'caspianNotesLibrary',
            'Notes',
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
            },
        );
        NotePanel.instance = new NotePanel(panel, context, store, focus);
        return NotePanel.instance;
    }

    private readonly disposables: vscode.Disposable[] = [];

    private constructor(
        private readonly panel: vscode.WebviewPanel,
        private readonly context: vscode.ExtensionContext,
        private readonly store: NoteStore,
        private readonly initialFocus: 'new' | { editId: string } | undefined,
    ) {
        panel.webview.html = this.render();
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(
            (msg: WebviewToHost) => this.onMessage(msg),
            null,
            this.disposables,
        );
        this.disposables.push(
            store.onChange(async () => this.post({ type: 'updated', notes: await store.list() })),
            vscode.workspace.onDidChangeConfiguration(async (e) => {
                if (e.affectsConfiguration('caspianNotes')) {
                    await this.sendInit();
                }
            }),
        );
    }

    private dispose(): void {
        NotePanel.instance = undefined;
        while (this.disposables.length) {
            this.disposables.pop()?.dispose();
        }
    }

    private post(msg: HostToWebview): void {
        this.panel.webview.postMessage(msg);
    }

    private async sendInit(): Promise<void> {
        const cfg = vscode.workspace.getConfiguration('caspianNotes');
        const defaultAction = cfg.get<CardAction>('defaultCardAction') ?? 'copy';
        const minColumnWidth = cfg.get<number>('minColumnWidth') ?? 260;
        const notes = await this.store.list();
        this.post({ type: 'init', notes, defaultAction, minColumnWidth });
        if (this.initialFocus === 'new') {
            this.post({ type: 'focusNew' });
        } else if (this.initialFocus && 'editId' in this.initialFocus) {
            this.post({ type: 'focusEdit', id: this.initialFocus.editId });
        }
    }

    private async onMessage(msg: WebviewToHost): Promise<void> {
        switch (msg.type) {
            case 'ready':
                await this.sendInit();
                return;
            case 'action':
                await performAction(this.store, msg.action, msg.id, this.presenter);
                return;
            case 'create':
                await this.store.create(msg.draft);
                return;
            case 'update':
                await this.store.update(msg.id, msg.patch);
                return;
            case 'delete':
                // Delegate to the registered command so the webview and the
                // tree-view share one undo-on-delete code path.
                await vscode.commands.executeCommand('caspianNotes.item.delete', msg.id);
                return;
        }
    }

    private get presenter(): ActionPresenter {
        return {
            notify: (message, level) => this.post({ type: 'toast', message, level }),
            // Edit on a card is handled entirely inside the webview (the
            // editor modal). The host-side dispatch is a no-op here.
            onEdit: () => undefined,
        };
    }

    private render(): string {
        const webview = this.panel.webview;
        const mediaUri = (name: string) =>
            webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', name));
        const nonce = crypto.randomBytes(16).toString('base64');
        const csp = [
            `default-src 'none'`,
            `img-src ${webview.cspSource} data:`,
            `style-src ${webview.cspSource} 'unsafe-inline'`,
            // 'nonce-X' covers the inline-loaded entry script; webview.cspSource
            // covers ES-module imports it pulls in (fuse.js, etc.).
            `script-src 'nonce-${nonce}' ${webview.cspSource}`,
            `font-src ${webview.cspSource}`,
        ].join('; ');
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${mediaUri('styles.css')}" />
  <title>Notes</title>
</head>
<body>
  <header class="toolbar">
    <input id="search" type="search" placeholder="Search notes, tags, body…" autocomplete="off" spellcheck="false" />
    <div class="view-toggle" role="group" aria-label="Toggle view">
      <button id="view-grid" class="view-btn" title="Grid view" aria-pressed="true" aria-label="Grid view">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <rect x="2" y="2" width="5" height="5" rx="0.6"/>
          <rect x="9" y="2" width="5" height="5" rx="0.6"/>
          <rect x="2" y="9" width="5" height="5" rx="0.6"/>
          <rect x="9" y="9" width="5" height="5" rx="0.6"/>
        </svg>
      </button>
      <button id="view-list" class="view-btn" title="List view" aria-pressed="false" aria-label="List view">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
          <line x1="3" y1="4" x2="13" y2="4"/>
          <line x1="3" y1="8" x2="13" y2="8"/>
          <line x1="3" y1="12" x2="13" y2="12"/>
        </svg>
      </button>
    </div>
    <button id="new-btn" class="primary" title="Create a new note">+ New</button>
  </header>
  <div id="tags" class="tag-row" aria-label="Filter by tag"></div>
  <main id="grid" class="grid" aria-live="polite"></main>
  <div id="empty" class="empty" hidden>
    <h2>Your notes library is empty</h2>
    <p>Click <strong>+ New</strong> to add your first one.</p>
  </div>
  <div id="toast" class="toast" hidden></div>

  <div id="editor-backdrop" class="backdrop" hidden>
    <div class="editor" role="dialog" aria-modal="true" aria-labelledby="editor-title">
      <header>
        <h2 id="editor-title">New note</h2>
        <button id="editor-close" class="icon" aria-label="Close">&times;</button>
      </header>
      <label>
        <span>Title</span>
        <input id="editor-title-input" type="text" maxlength="200" />
      </label>
      <label>
        <span>Tags (comma-separated)</span>
        <input id="editor-tags-input" type="text" placeholder="review, claude, bugfix" />
      </label>
      <label class="body-label">
        <span class="body-label-row">
          <span>Body</span>
          <span class="body-mode-toggle" role="group" aria-label="Body view mode">
            <button id="body-mode-edit" type="button" class="mode-btn active" aria-pressed="true">Edit</button>
            <button id="body-mode-preview" type="button" class="mode-btn" aria-pressed="false">Preview</button>
          </span>
        </span>
        <textarea id="editor-body-input" rows="12" spellcheck="false"></textarea>
        <div id="editor-body-preview" class="body-preview" hidden></div>
      </label>
      <footer>
        <button id="editor-delete" class="danger" hidden>Delete</button>
        <div class="spacer"></div>
        <button id="editor-cancel">Cancel</button>
        <button id="editor-save" class="primary">Save</button>
      </footer>
    </div>
  </div>

  <script type="module" nonce="${nonce}" src="${mediaUri('main.js')}"></script>
</body>
</html>`;
    }
}
