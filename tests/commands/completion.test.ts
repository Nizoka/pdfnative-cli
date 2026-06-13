import { describe, it, expect, vi } from 'vitest';
import { completion } from '../../src/commands/completion.js';
import { parseArgs } from '../../src/utils/args.js';
import { CliError } from '../../src/utils/error.js';

function capture(fn: () => Promise<void>): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: string[] = [];
        const spy = vi.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => {
            chunks.push(String(c));
            return true;
        });
        fn().then(
            () => {
                spy.mockRestore();
                resolve(chunks.join(''));
            },
            (e: unknown) => {
                spy.mockRestore();
                reject(e as Error);
            },
        );
    });
}

describe('completion', () => {
    it('emits a bash script referencing the commands and complete builtin', async () => {
        const out = await capture(() => completion(parseArgs(['bash'])));
        expect(out).toContain('complete -F _pdfnative pdfnative');
        expect(out).toContain('render');
        expect(out).toContain('--revocation');
    });

    it('emits a zsh script with #compdef header', async () => {
        const out = await capture(() => completion(parseArgs(['zsh'])));
        expect(out.startsWith('#compdef pdfnative')).toBe(true);
        expect(out).toContain('_describe');
    });

    it('emits a fish script with complete -c pdfnative', async () => {
        const out = await capture(() => completion(parseArgs(['fish'])));
        expect(out).toContain('complete -c pdfnative');
        expect(out).toContain('__fish_use_subcommand -a render');
    });

    it('throws CliError(2) when no shell is given', async () => {
        await expect(completion(parseArgs([]))).rejects.toMatchObject({ exitCode: 2 });
    });

    it('throws CliError(2) for an unsupported shell', async () => {
        await expect(completion(parseArgs(['powershell']))).rejects.toBeInstanceOf(CliError);
    });

    it('includes the schema command and agent global flags in each shell', async () => {
        for (const shell of ['bash', 'zsh', 'fish']) {
            const out = await capture(() => completion(parseArgs([shell])));
            expect(out).toContain('schema');
            expect(out).toContain('json');
            expect(out).toContain('dry-run');
        }
    });
});
