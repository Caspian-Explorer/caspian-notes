import * as vscode from 'vscode';
import { NoteStore } from './noteStore';
import { Note } from './types';

export class NoteTreeItem extends vscode.TreeItem {
    constructor(public readonly note: Note) {
        super(note.title || 'Untitled', vscode.TreeItemCollapsibleState.None);
        this.description = note.tags.join(', ');
        const tooltip = new vscode.MarkdownString(
            `**${escapeMarkdown(note.title)}**\n\n${escapeMarkdown(
                note.body.slice(0, 600),
            )}${note.body.length > 600 ? '…' : ''}`,
        );
        tooltip.isTrusted = false;
        tooltip.supportHtml = false;
        this.tooltip = tooltip;
        this.contextValue = 'caspianNotes.item';
        this.iconPath = new vscode.ThemeIcon(note.pinned ? 'pinned' : 'note');
        this.command = {
            command: 'caspianNotes.item.defaultAction',
            title: '',
            arguments: [note.id],
        };
    }
}

class TagGroupItem extends vscode.TreeItem {
    constructor(public readonly tag: string, public readonly notes: Note[]) {
        super(`${tag} (${notes.length})`, vscode.TreeItemCollapsibleState.Expanded);
        this.contextValue = 'caspianNotes.tagGroup';
        this.iconPath = new vscode.ThemeIcon('tag');
    }
}

type TreeElement = NoteTreeItem | TagGroupItem;

export class NoteTreeProvider implements vscode.TreeDataProvider<TreeElement> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private readonly store: NoteStore) {
        store.onChange(() => this._onDidChangeTreeData.fire());
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TreeElement): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TreeElement): Promise<TreeElement[]> {
        const grouping = vscode.workspace
            .getConfiguration('caspianNotes')
            .get<string>('treeGrouping', 'flat');

        // Flat: no nested structure.
        if (grouping !== 'byTag') {
            if (element) {
                return [];
            }
            const notes = await this.store.list();
            return notes.map((n) => new NoteTreeItem(n));
        }

        // byTag — root level emits tag groups; group-children emit note items.
        if (element instanceof TagGroupItem) {
            return element.notes.map((n) => new NoteTreeItem(n));
        }
        if (element) {
            return [];
        }

        const notes = await this.store.list();
        const tagMap = new Map<string, Note[]>();
        const untagged: Note[] = [];
        for (const note of notes) {
            if (note.tags.length === 0) {
                untagged.push(note);
                continue;
            }
            for (const tag of note.tags) {
                let list = tagMap.get(tag);
                if (!list) {
                    list = [];
                    tagMap.set(tag, list);
                }
                list.push(note);
            }
        }
        const sortedTags = Array.from(tagMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        const groups: TagGroupItem[] = sortedTags.map(([tag, list]) => new TagGroupItem(tag, list));
        if (untagged.length > 0) {
            groups.push(new TagGroupItem('Untagged', untagged));
        }
        return groups;
    }
}

// Escape characters that have special meaning in MarkdownString. Defensive even
// with isTrusted=false, because we still don't want note bodies to look like
// rendered markdown in the tooltip (headings, lists, links, etc.).
function escapeMarkdown(s: string): string {
    return s.replace(/([\\`*_{}[\]()#+!~>|-])/g, '\\$1');
}
