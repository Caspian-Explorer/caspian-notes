import * as vscode from 'vscode';
import * as path from 'path';
import { NoteStore } from './noteStore';
import { resolveChatCommand } from './chatCommand';
import { expandTemplate, ExpansionContext } from './templates';
import { CardAction, Note } from './types';

/**
 * Surface-specific feedback hook. The webview posts toasts; tree-view
 * commands write to the status bar / show notifications. Both share the
 * same action logic via {@link performAction}.
 */
export interface ActionPresenter {
    notify(message: string, level?: 'info' | 'error'): void;
    onEdit(noteId: string): void;
}

export async function performAction(
    store: NoteStore,
    action: CardAction,
    id: string | undefined,
    presenter: ActionPresenter,
): Promise<void> {
    if (!id) {
        return;
    }
    const note = await store.get(id);
    if (!note) {
        presenter.notify('Note not found.', 'error');
        return;
    }
    if (action === 'edit') {
        presenter.onEdit(note.id);
        return;
    }
    const body = await resolveBody(note);
    if (body === undefined) {
        // User cancelled a template-variable prompt.
        presenter.notify('Cancelled.', 'info');
        return;
    }
    const resolved: Note = { ...note, body };
    switch (action) {
        case 'copy':
            await vscode.env.clipboard.writeText(resolved.body);
            presenter.notify(`Copied "${resolved.title}"`);
            return;
        case 'insert':
            await insertBody(resolved, presenter);
            return;
        case 'sendToChat':
            await sendToChat(resolved, presenter);
            return;
    }
}

async function resolveBody(note: Note): Promise<string | undefined> {
    return expandTemplate(note.body, currentEditorContext(), promptForVariable);
}

function currentEditorContext(): ExpansionContext {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return {};
    }
    const filePath = editor.document.uri.fsPath;
    return {
        selection: editor.selection.isEmpty ? undefined : editor.document.getText(editor.selection),
        fileName: filePath ? path.basename(filePath) : undefined,
        filePath: filePath || undefined,
    };
}

async function promptForVariable(name: string): Promise<string | undefined> {
    return vscode.window.showInputBox({
        prompt: `Value for {{${name}}}`,
        ignoreFocusOut: true,
    });
}

async function insertBody(note: Note, presenter: ActionPresenter): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        await vscode.env.clipboard.writeText(note.body);
        presenter.notify('No active editor — copied to clipboard instead.');
        return;
    }
    await editor.edit((eb) => {
        for (const sel of editor.selections) {
            eb.replace(sel, note.body);
        }
    });
    presenter.notify(`Inserted "${note.title}"`);
}

async function sendToChat(note: Note, presenter: ActionPresenter): Promise<void> {
    const cmd = resolveChatCommand();
    try {
        await vscode.commands.executeCommand(cmd, note.body);
        presenter.notify(`Sent "${note.title}" to chat`);
    } catch {
        await vscode.env.clipboard.writeText(note.body);
        presenter.notify(
            `Chat command "${cmd}" failed — copied to clipboard instead.`,
            'error',
        );
    }
}
