// completion: the v1.5.0 flags reach every shell script.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { completion } from '../../src/commands/completion.js';
import { parseArgs } from '../../src/utils/args.js';
import { captured } from '../helpers/cli-harness.js';

describe('completion (v1.5.0 flags)', () => {
    afterEach(() => vi.restoreAllMocks());

    it.each(['bash', 'zsh', 'fish', 'powershell'])('%s lists the new render/inspect/sign flags and the global --creation-date', async (shell) => {
        const { stdout } = await captured(() => completion(parseArgs([shell])));
        // fish strips the leading `--` (emits `-l name`), so match the bare names.
        for (const name of ['creation-date', 'pdfx', 'output-intent-icc', 'output-intent-id', 'trapped', 'font-file', 'font-features', 'split-paragraphs', 'iso-dates', 'timestamp-timeout']) {
            expect(stdout, `${shell}: ${name}`).toContain(name);
        }
    });
});
