// render: every diagnostic code pdfnative 1.8.0 can emit is TRIGGERED through
// the CLI — as a warning in the --json envelope and on stderr, and as
// E_CHECK_FAILED under --strict (no file written).

import { describe, it, expect, afterEach, beforeAll, afterAll, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import { render } from '../../src/commands/render.js';
import { parseArgs } from '../../src/utils/args.js';
import { ErrorCode } from '../../src/utils/error.js';
import { TempFiles, SYNTHETIC_CMYK_ICC, captured, renderJson, renderTo, diagnosticCodes, expectCliError } from '../helpers/cli-harness.js';
import { DIAGNOSTIC_TRIGGERS } from '../helpers/diagnostic-triggers.js';

const tmp = new TempFiles();
const shared = new TempFiles();
let v4Icc = '';

beforeAll(async () => {
    // The CMYK fixture with its ICC major version set to 4: the engine reads header byte 8.
    const icc = Uint8Array.from(await fs.readFile(SYNTHETIC_CMYK_ICC));
    icc[8] = 0x04;
    icc[9] = 0x20;
    v4Icc = await shared.bytes('cmyk-v4.icc', icc);
});
afterAll(() => shared.cleanup());
afterEach(async () => {
    vi.restoreAllMocks();
    await tmp.cleanup();
});

interface Diagnostic { code: string; severity: string; message: string }

describe('render: diagnostics triggered through the CLI (engine 1.8.0)', () => {
    it.each(Object.entries(DIAGNOSTIC_TRIGGERS))('%s is a warning in the envelope and on stderr', async (code, trigger) => {
        const argv = trigger.argv({ v4Icc });
        const { envelope, bytes } = await renderJson(tmp, trigger.doc, argv);
        expect(envelope.ok).toBe(true);
        expect(bytes.subarray(0, 4).toString('ascii')).toBe('%PDF');
        const codes = diagnosticCodes(envelope);
        expect(codes).toContain(code);
        expect(codes.filter((c) => c !== code && !(trigger.alongside ?? []).includes(c))).toEqual([]);
        const hit = (envelope.diagnostics as Diagnostic[]).find((d) => d.code === code)!;
        expect(hit.severity).toBe('warning');
        expect(hit.message).toMatch(trigger.message);
        const { stderr } = await renderTo(tmp, trigger.doc, argv, 'plain.pdf');
        expect(stderr).toContain(`warning: [${code}]`);
    });

    it.each(Object.entries(DIAGNOSTIC_TRIGGERS))('%s fails the render under --strict with E_CHECK_FAILED and writes nothing', async (_code, trigger) => {
        const input = await tmp.json('in.json', trigger.doc);
        const output = tmp.path('strict.pdf');
        await expectCliError(
            () => captured(() => render(parseArgs(['--input', input, '--output', output, ...trigger.argv({ v4Icc }), '--strict']))),
            1,
            ErrorCode.CHECK_FAILED,
        );
        await expect(fs.stat(output)).rejects.toThrow();
    });

    it('PDFA_ICC_PROFILE_VERSION is a PDF/A-1 rule: the same v4 profile is silent under pdfa2b', async () => {
        const trigger = DIAGNOSTIC_TRIGGERS['PDFA_ICC_PROFILE_VERSION']!;
        const { envelope } = await renderJson(tmp, trigger.doc, ['--tagged', 'pdfa2b', '--font', 'latin', '--lang', 'latin', '--output-intent-icc', v4Icc]);
        expect(diagnosticCodes(envelope)).toEqual([]);
    });

    it('TYPOGRAPHY_FEATURE_INEFFECTIVE also reports a feature no registered font declares (base-14 run)', async () => {
        const { envelope } = await renderJson(tmp, DIAGNOSTIC_TRIGGERS['TYPOGRAPHY_FEATURE_INEFFECTIVE']!.doc, ['--font-features', 'smcp']);
        const hit = (envelope.diagnostics as Diagnostic[]).find((d) => d.code === 'TYPOGRAPHY_FEATURE_INEFFECTIVE');
        expect(hit?.message).toMatch(/no registered font/);
    });

    it('PDFA_UNEMBEDDED_FORM_FONT disappears once a Latin font is embedded', async () => {
        const { envelope } = await renderJson(tmp, DIAGNOSTIC_TRIGGERS['PDFA_UNEMBEDDED_FORM_FONT']!.doc, ['--tagged', 'pdfa2b', '--font', 'latin', '--lang', 'latin', '--strict']);
        expect(diagnosticCodes(envelope)).toEqual([]);
    });
});
