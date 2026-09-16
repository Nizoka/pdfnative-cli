import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyBuildError, INPUT_ERROR_PREFIXES } from '../../src/utils/build-errors.js';
import { ErrorCode } from '../../src/utils/error.js';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'pdfnative-build-errors.json');

interface Fixture {
    readonly engine: string;
    readonly source: string;
    readonly messages: readonly { readonly thrownBy?: string; readonly message: string }[];
}

describe('classifyBuildError', () => {
    const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Fixture;

    it('the fixture is the engine version the CLI pins', () => {
        const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'node_modules', 'pdfnative', 'package.json'), 'utf8')) as { version: string };
        expect(pkg.version.split('.').slice(0, 2).join('.')).toBe(fixture.engine.split('.').slice(0, 2).join('.'));
        expect(fixture.messages.length).toBeGreaterThan(10);
    });

    it('classifies every build error pdfnative documents as E_INPUT', () => {
        const unclassified = fixture.messages.filter((m) => classifyBuildError(m.message, false) !== ErrorCode.INPUT);
        expect(unclassified.map((m) => m.message)).toEqual([]);
    });

    it('classifies the PDF/X coherence errors (pdfnative 1.8.0) as E_INPUT', () => {
        for (const m of [
            'layout.pdfx: unknown target \'pdfx1a\' — use one of pdfx4',
            'layout.pdfx and layout.tagged cannot be combined — pdfnative writes one conformance claim per file; drop one of them',
            'PDF/X forbids encryption (ISO 15930-7) — drop layout.encryption or layout.pdfx',
            'PDF/X-4 requires layout.outputIntent: the ICC profile of the printing condition',
            'PDF/X requires the trapping state to be known — set metadata.trapped to \'True\' or \'False\', or omit it for \'False\'',
            'PDF/X pages carry a TrimBox or an ArtBox, not both',
        ]) {
            expect(classifyBuildError(m, false), m).toBe(ErrorCode.INPUT);
        }
    });

    it('strict-mode escalations are E_CHECK_FAILED only under --strict', () => {
        const escalation = 'pdfnative: [PDFX_NO_FONT_ENTRIES] pdfx: every font must be embedded';
        expect(classifyBuildError(escalation, true)).toBe(ErrorCode.CHECK_FAILED);
        expect(classifyBuildError(escalation, false)).toBeNull();
    });

    it('leaves unknown messages to the caller (E_RUNTIME by default)', () => {
        expect(classifyBuildError('ENOSPC: no space left on device', false)).toBeNull();
        expect(classifyBuildError('', true)).toBeNull();
    });

    it('keeps the 1.7.0 prefixes', () => {
        for (const p of ['print.', 'chart:', 'outputIntent.']) expect(INPUT_ERROR_PREFIXES).toContain(p);
    });
});
