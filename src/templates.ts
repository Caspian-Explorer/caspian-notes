// Pure template-expansion logic. Kept free of `vscode` so it's directly
// testable with vitest — the call site supplies the editor context and a
// prompt callback for unknown variables.

const VARIABLE_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_-]*)\s*\}\}/g;

export interface ExpansionContext {
    /** Selected text in the active editor, if any. */
    selection?: string;
    /** Active editor's file basename (e.g. "extension.ts"). */
    fileName?: string;
    /** Active editor's full path on disk. */
    filePath?: string;
    /** Override "now" — primarily for tests. */
    now?: Date;
}

const BUILTINS: Record<string, (ctx: ExpansionContext) => string> = {
    date: (ctx) => (ctx.now ?? new Date()).toISOString().slice(0, 10),
    time: (ctx) => (ctx.now ?? new Date()).toTimeString().slice(0, 8),
    datetime: (ctx) => (ctx.now ?? new Date()).toISOString(),
    selection: (ctx) => ctx.selection ?? '',
    filename: (ctx) => ctx.fileName ?? '',
    filepath: (ctx) => ctx.filePath ?? '',
};

/**
 * Returns the unique set of variable names referenced in `body`, in order
 * of first appearance, lower-cased.
 */
export function extractVariables(body: string): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const match of body.matchAll(VARIABLE_RE)) {
        const name = match[1]!.toLowerCase();
        if (!seen.has(name)) {
            seen.add(name);
            out.push(name);
        }
    }
    return out;
}

export const BUILTIN_VARIABLES = Object.keys(BUILTINS);

export function isBuiltin(name: string): boolean {
    return name in BUILTINS;
}

/**
 * Expands `{{var}}` placeholders in `body`. Built-ins resolve from `ctx`
 * (or current time for date/time). For each non-builtin variable, calls
 * `prompt(name)` once. If `prompt` returns `undefined` the action is
 * considered cancelled and this function returns `undefined`.
 */
export async function expandTemplate(
    body: string,
    ctx: ExpansionContext,
    prompt: (name: string) => Promise<string | undefined>,
): Promise<string | undefined> {
    const vars = extractVariables(body);
    if (vars.length === 0) {
        return body;
    }
    const values = new Map<string, string>();
    for (const name of vars) {
        const builtin = BUILTINS[name];
        if (builtin) {
            values.set(name, builtin(ctx));
            continue;
        }
        const value = await prompt(name);
        if (value === undefined) {
            return undefined;
        }
        values.set(name, value);
    }
    return body.replace(VARIABLE_RE, (_full, rawName) => {
        return values.get(String(rawName).toLowerCase()) ?? '';
    });
}
