import { describe, it, expect } from 'vitest';
import { extractVariables, expandTemplate } from './templates';

describe('extractVariables', () => {
    it('returns empty array when no variables', () => {
        expect(extractVariables('hello world')).toEqual([]);
    });

    it('finds simple variables', () => {
        expect(extractVariables('Hello {{name}}, today is {{date}}')).toEqual(['name', 'date']);
    });

    it('dedupes repeated variables, preserving first-seen order', () => {
        expect(extractVariables('{{a}} {{b}} {{a}} {{c}} {{b}}')).toEqual(['a', 'b', 'c']);
    });

    it('lowercases variable names', () => {
        expect(extractVariables('{{Name}} {{NAME}}')).toEqual(['name']);
    });

    it('tolerates whitespace inside braces', () => {
        expect(extractVariables('{{ foo }} {{  bar  }}')).toEqual(['foo', 'bar']);
    });

    it('ignores text that looks like variables but contains invalid characters', () => {
        expect(extractVariables('{{ 1abc }} {{x.y}}')).toEqual([]);
    });
});

describe('expandTemplate', () => {
    const noPrompt = async () => undefined;
    const noopCtx = { now: new Date('2026-04-25T10:00:00Z') };

    it('returns body unchanged when no variables', async () => {
        const result = await expandTemplate('hello', noopCtx, noPrompt);
        expect(result).toBe('hello');
    });

    it('expands {{date}} and {{datetime}} from context.now', async () => {
        const result = await expandTemplate(
            '{{date}} | {{datetime}}',
            noopCtx,
            noPrompt,
        );
        expect(result).toBe('2026-04-25 | 2026-04-25T10:00:00.000Z');
    });

    it('expands {{selection}} from context', async () => {
        const result = await expandTemplate(
            'Review: {{selection}}',
            { selection: 'foo()', ...noopCtx },
            noPrompt,
        );
        expect(result).toBe('Review: foo()');
    });

    it('expands {{filename}} and {{filepath}}', async () => {
        const result = await expandTemplate(
            'In {{filename}} ({{filepath}})',
            { fileName: 'a.ts', filePath: '/x/y/a.ts', ...noopCtx },
            noPrompt,
        );
        expect(result).toBe('In a.ts (/x/y/a.ts)');
    });

    it('prompts for unknown variables and substitutes them', async () => {
        const calls: string[] = [];
        const prompt = async (name: string) => {
            calls.push(name);
            return name === 'topic' ? 'security' : 'Claude';
        };
        const result = await expandTemplate(
            'Ask {{model}} about {{topic}}',
            noopCtx,
            prompt,
        );
        expect(calls).toEqual(['model', 'topic']);
        expect(result).toBe('Ask Claude about security');
    });

    it('only prompts once per unique variable name', async () => {
        const calls: string[] = [];
        const prompt = async (name: string) => {
            calls.push(name);
            return 'X';
        };
        await expandTemplate('{{a}} {{a}} {{a}}', noopCtx, prompt);
        expect(calls).toEqual(['a']);
    });

    it('returns undefined when the user cancels any prompt', async () => {
        const prompt = async () => undefined;
        const result = await expandTemplate('Hi {{name}}', noopCtx, prompt);
        expect(result).toBeUndefined();
    });

    it('treats missing context fields as empty strings', async () => {
        const result = await expandTemplate(
            '[{{selection}}][{{filename}}]',
            noopCtx,
            noPrompt,
        );
        expect(result).toBe('[][]');
    });
});
