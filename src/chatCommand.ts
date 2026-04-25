import * as vscode from 'vscode';

export const DEFAULT_CHAT_COMMAND = 'workbench.action.chat.open';

const warned = new Set<string>();

/**
 * Resolves the user's `caspianNotes.chatCommand` setting to a safe command id.
 *
 * Validation rule: the command id must contain "chat" (case-insensitive). This
 * is a heuristic — it admits all real chat-extension commands (Copilot, Claude
 * Code, etc.) and excludes destructive built-ins like
 * `workbench.action.quit` or `workbench.action.reloadWindow`. Falls back to
 * {@link DEFAULT_CHAT_COMMAND} when the setting is empty or fails validation,
 * and shows a one-time warning the first time a given invalid value is seen.
 */
export function resolveChatCommand(): string {
    const raw = vscode.workspace
        .getConfiguration('caspianNotes')
        .get<string>('chatCommand', DEFAULT_CHAT_COMMAND);
    const trimmed = (raw ?? '').trim();
    if (!trimmed) {
        return DEFAULT_CHAT_COMMAND;
    }
    if (isAllowedChatCommand(trimmed)) {
        return trimmed;
    }
    if (!warned.has(trimmed)) {
        warned.add(trimmed);
        vscode.window.showWarningMessage(
            `Caspian Notes: ignoring chatCommand "${trimmed}" — only commands containing "chat" are allowed for safety. Falling back to "${DEFAULT_CHAT_COMMAND}".`,
        );
    }
    return DEFAULT_CHAT_COMMAND;
}

export function isAllowedChatCommand(cmd: string): boolean {
    if (typeof cmd !== 'string' || cmd.length === 0) {
        return false;
    }
    return /chat/i.test(cmd);
}
