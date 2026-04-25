import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import matter from 'gray-matter';
import { Note } from './types';

export interface ParseError {
    file: string;
    reason: string;
}

export class NoteStore {
    private readonly changeListeners = new Set<() => void>();
    private readonly parseErrorListeners = new Set<(err: ParseError) => void>();

    static fromContext(context: vscode.ExtensionContext): NoteStore {
        return new NoteStore(path.join(context.globalStorageUri.fsPath, 'notes'));
    }

    constructor(public readonly dir: string) {}

    async init(): Promise<void> {
        // No-op: directory creation is deferred to the first write() so that
        // activation never blocks on filesystem I/O. Kept for backward compat.
    }

    onChange(listener: () => void): vscode.Disposable {
        this.changeListeners.add(listener);
        return { dispose: () => this.changeListeners.delete(listener) };
    }

    onParseError(listener: (err: ParseError) => void): vscode.Disposable {
        this.parseErrorListeners.add(listener);
        return { dispose: () => this.parseErrorListeners.delete(listener) };
    }

    private emitChange(): void {
        for (const l of this.changeListeners) {
            l();
        }
    }

    private emitParseError(err: ParseError): void {
        for (const l of this.parseErrorListeners) {
            l(err);
        }
    }

    async list(): Promise<Note[]> {
        const entries = await fs.readdir(this.dir).catch(() => [] as string[]);
        const files = entries.filter((f) => f.endsWith('.md'));
        const results = await Promise.all(files.map((f) => this.read(path.join(this.dir, f))));
        const notes = results.filter((n): n is Note => n !== undefined);
        notes.sort((a, b) => {
            if (a.pinned !== b.pinned) {
                return a.pinned ? -1 : 1;
            }
            return b.updatedAt.localeCompare(a.updatedAt);
        });
        return notes;
    }

    async get(id: string): Promise<Note | undefined> {
        return this.read(this.pathFor(id));
    }

    async create(draft: { title: string; tags: string[]; body: string }): Promise<Note> {
        const now = new Date().toISOString();
        const note: Note = {
            id: crypto.randomUUID(),
            title: draft.title.trim() || 'Untitled',
            body: draft.body,
            tags: normaliseTags(draft.tags),
            createdAt: now,
            updatedAt: now,
            pinned: false,
        };
        await this.write(note);
        this.emitChange();
        return note;
    }

    async update(
        id: string,
        patch: { title?: string; tags?: string[]; body?: string; pinned?: boolean },
    ): Promise<Note | undefined> {
        const existing = await this.get(id);
        if (!existing) {
            return undefined;
        }
        // Toggling only `pinned` should not bump updatedAt — pin order is
        // independent of recency. Other field changes do bump updatedAt.
        const onlyPinChanged =
            patch.title === undefined &&
            patch.tags === undefined &&
            patch.body === undefined &&
            patch.pinned !== undefined;
        const next: Note = {
            ...existing,
            title: patch.title !== undefined ? (patch.title.trim() || 'Untitled') : existing.title,
            tags: patch.tags !== undefined ? normaliseTags(patch.tags) : existing.tags,
            body: patch.body !== undefined ? patch.body : existing.body,
            pinned: patch.pinned !== undefined ? patch.pinned : existing.pinned,
            updatedAt: onlyPinChanged ? existing.updatedAt : new Date().toISOString(),
        };
        await this.write(next);
        this.emitChange();
        return next;
    }

    async delete(id: string): Promise<void> {
        await fs.unlink(this.pathFor(id)).catch(() => undefined);
        this.emitChange();
    }

    /**
     * Re-write a previously-deleted note back to disk. Used to power Undo
     * after delete. Preserves id, createdAt, updatedAt — does NOT bump
     * updatedAt.
     */
    async restore(note: Note): Promise<void> {
        await this.write(note);
        this.emitChange();
    }

    /**
     * Bulk-import notes from an external source (e.g. a JSON export from
     * another machine). Assigns fresh ids to every note to avoid
     * collisions, but preserves title/body/tags/pinned/createdAt where
     * present. Returns the number of notes successfully imported.
     */
    async importNotes(input: ReadonlyArray<unknown>): Promise<number> {
        const now = new Date().toISOString();
        let count = 0;
        for (const raw of input) {
            if (typeof raw !== 'object' || raw === null) {
                continue;
            }
            const r = raw as Partial<Note>;
            const note: Note = {
                id: crypto.randomUUID(),
                title: typeof r.title === 'string' && r.title.trim() ? r.title.trim() : 'Untitled',
                body: typeof r.body === 'string' ? r.body : '',
                tags: Array.isArray(r.tags) ? normaliseTags(r.tags.map(String)) : [],
                pinned: r.pinned === true,
                createdAt: typeof r.createdAt === 'string' ? r.createdAt : now,
                updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : now,
            };
            await this.write(note);
            count++;
        }
        if (count > 0) {
            this.emitChange();
        }
        return count;
    }

    /**
     * Notify listeners that the underlying directory has changed (used by the
     * filesystem watcher in extension.ts).
     */
    notifyExternalChange(): void {
        this.emitChange();
    }

    private pathFor(id: string): string {
        return path.join(this.dir, `${id}.md`);
    }

    private async read(filePath: string): Promise<Note | undefined> {
        const raw = await fs.readFile(filePath, 'utf8').catch(() => undefined);
        if (raw === undefined) {
            return undefined;
        }
        let parsed: matter.GrayMatterFile<string>;
        try {
            parsed = matter(raw);
        } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            this.emitParseError({ file: filePath, reason });
            return undefined;
        }
        const data = parsed.data as Partial<Note>;
        const id = data.id ?? path.basename(filePath, '.md');
        return {
            id,
            title: typeof data.title === 'string' ? data.title : 'Untitled',
            tags: Array.isArray(data.tags) ? normaliseTags(data.tags.map(String)) : [],
            createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date(0).toISOString(),
            updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date(0).toISOString(),
            pinned: data.pinned === true,
            // Strip the leading blank line that write() inserts between the
            // frontmatter and body, and the single trailing newline that
            // gray-matter.stringify always appends. This keeps round-trip
            // (create → list → update → list) byte-stable.
            body: parsed.content.replace(/^\n+/, '').replace(/\n$/, ''),
        };
    }

    private async write(note: Note): Promise<void> {
        await fs.mkdir(this.dir, { recursive: true });
        const frontmatter: Record<string, unknown> = {
            id: note.id,
            title: note.title,
            tags: note.tags,
            createdAt: note.createdAt,
            updatedAt: note.updatedAt,
        };
        // Only serialize `pinned` when true to keep frontmatter clean for the
        // common case. Reads default to false when the key is absent.
        if (note.pinned) {
            frontmatter.pinned = true;
        }
        const serialized = matter.stringify(`\n${note.body}`, frontmatter);
        await fs.writeFile(this.pathFor(note.id), serialized, 'utf8');
    }
}

function normaliseTags(tags: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of tags) {
        const t = raw.trim().toLowerCase();
        if (t && !seen.has(t)) {
            seen.add(t);
            out.push(t);
        }
    }
    return out;
}
