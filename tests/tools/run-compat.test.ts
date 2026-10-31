import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { allowListForTag, findAllowList, parseAllowList, tagAvailable } from '../../scripts/run-compat.js';

/**
 * The pure parts of scripts/run-compat.ts (v1.6.0): which allow-list a run
 * uses, and what an allow-list must contain. scripts/gate.ts shares the
 * discovery (one implementation, numeric order), so a repository holding
 * allow-1.9.0.json next to allow-1.10.0.json probes the right tag in both.
 */

let root: string;
beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'pdfcli-compat-'));
    mkdirSync(join(root, 'tests', 'compat'), { recursive: true });
    for (const v of ['1.9.0', '1.10.0', '1.2.3']) {
        writeFileSync(join(root, 'tests', 'compat', `allow-${v}.json`), JSON.stringify({ tag: `v${v}`, exclude: [] }));
    }
    writeFileSync(join(root, 'tests', 'compat', 'allow-notes.json'), '{}');
});
afterAll(() => { rmSync(root, { recursive: true, force: true }); });

describe('findAllowList', () => {
    it('should pick the newest allow-list in numeric order, not in string order', () => {
        expect(findAllowList(root)).toBe(join(root, 'tests', 'compat', 'allow-1.10.0.json'));
    });

    it('should answer null when the directory does not exist', () => {
        expect(findAllowList(join(root, 'nowhere'))).toBeNull();
    });
});

describe('allowListForTag', () => {
    it('should resolve --tag vX.Y.Z to its own allow-list, and null when that release has none', () => {
        expect(allowListForTag(root, 'v1.9.0')).toBe(join(root, 'tests', 'compat', 'allow-1.9.0.json'));
        expect(allowListForTag(root, 'v1.4.0')).toBeNull();
    });
});

describe('parseAllowList', () => {
    it('should accept the committed allow-list', () => {
        const text = JSON.stringify({ tag: 'v1.5.0', exclude: [{ pattern: 'tests/tools/**', reason: 'Repository-tree tests, not command behaviour.' }, { pattern: 'tests/x.test.ts', reason: 'A behaviour change the ledger documents.', ledger: 'C2' }] });
        const allow = parseAllowList(text);
        expect(allow.tag).toBe('v1.5.0');
        expect(allow.exclude).toHaveLength(2);
    });

    it.each([
        ['a tag that is not vX.Y.Z', { tag: '1.5.0', exclude: [] }, /"tag" must be a vX\.Y\.Z string/],
        ['an exclude that is not an array', { tag: 'v1.5.0', exclude: {} }, /"exclude" must be an array/],
        ['an exclusion without a pattern', { tag: 'v1.5.0', exclude: [{ reason: 'A sentence of a reason, long enough.' }] }, /needs a "pattern"/],
        ['a one-word reason', { tag: 'v1.5.0', exclude: [{ pattern: 'x', reason: 'because' }] }, /needs a "reason"/],
        ['a ledger entry that is not Cn', { tag: 'v1.5.0', exclude: [{ pattern: 'x', reason: 'A sentence of a reason, long enough.', ledger: 'ledger-2' }] }, /ledger must look like "C3"/],
    ])('should refuse %s', (_label, doc, re) => {
        expect(() => parseAllowList(JSON.stringify(doc))).toThrow(re);
    });

    it('should let malformed JSON surface as a SyntaxError the caller reports (the gate runs the step instead of skipping it)', () => {
        expect(() => parseAllowList('{ "tag": "v1.5.0", }')).toThrow(SyntaxError);
    });
});

describe('tagAvailable', () => {
    it('should be false for a tag no clone has', () => {
        expect(tagAvailable(process.cwd(), 'v0.0.0-never')).toBe(false);
    });
});
