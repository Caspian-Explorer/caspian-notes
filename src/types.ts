export interface Note {
    id: string;
    title: string;
    body: string;
    tags: string[];
    createdAt: string;
    updatedAt: string;
    pinned: boolean;
}

export type CardAction = 'copy' | 'insert' | 'edit' | 'sendToChat';

export type HostToWebview =
    | { type: 'init'; notes: Note[]; defaultAction: CardAction; minColumnWidth: number }
    | { type: 'updated'; notes: Note[] }
    | { type: 'toast'; message: string; level?: 'info' | 'error' }
    | { type: 'focusNew' }
    | { type: 'focusEdit'; id: string };

export type WebviewToHost =
    | { type: 'ready' }
    | { type: 'action'; action: CardAction; id: string }
    | { type: 'create'; draft: { title: string; tags: string[]; body: string } }
    | { type: 'update'; id: string; patch: { title?: string; tags?: string[]; body?: string; pinned?: boolean } }
    | { type: 'delete'; id: string };
