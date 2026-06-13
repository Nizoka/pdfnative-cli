import { describe, it, expect } from 'vitest';
import { selectFields, serializeJson, parseFieldList } from '../../src/utils/projection.js';

describe('parseFieldList', () => {
    it('splits, trims and drops empty entries', () => {
        expect(parseFieldList('a, b ,,c')).toEqual(['a', 'b', 'c']);
    });

    it('returns an empty array for a blank string', () => {
        expect(parseFieldList('   ')).toEqual([]);
    });
});

describe('serializeJson', () => {
    const value = { a: 1, b: [2, 3] };

    it('emits compact JSON (no indentation) when pretty is false', () => {
        const out = serializeJson(value, false);
        expect(out).toBe('{"a":1,"b":[2,3]}');
        expect(out).not.toContain('\n');
    });

    it('emits 2-space pretty JSON when pretty is true', () => {
        const out = serializeJson(value, true);
        expect(out).toContain('\n');
        expect(out).toContain('  "a": 1');
    });

    it('compact is strictly smaller than pretty for the same value', () => {
        expect(serializeJson(value, false).length).toBeLessThan(serializeJson(value, true).length);
    });
});

describe('selectFields', () => {
    const result = {
        version: '1.7',
        pageCount: 3,
        encrypted: false,
        metadata: { title: 'Doc', author: 'A' },
        signatures: [
            { index: 0, signatureValid: true, fieldName: 'Sig1' },
            { index: 1, signatureValid: false, fieldName: 'Sig2' },
        ],
        allValid: false,
    };

    it('projects a single top-level scalar path', () => {
        expect(selectFields(result, ['pageCount'])).toEqual({ pageCount: 3 });
    });

    it('preserves nesting for a dotted path', () => {
        expect(selectFields(result, ['metadata.title'])).toEqual({ metadata: { title: 'Doc' } });
    });

    it('maps an array segment over every element', () => {
        expect(selectFields(result, ['signatures.signatureValid'])).toEqual({
            signatures: [{ signatureValid: true }, { signatureValid: false }],
        });
    });

    it('deep-merges multiple paths into one object', () => {
        expect(selectFields(result, ['allValid', 'signatures.index', 'signatures.fieldName'])).toEqual({
            allValid: false,
            signatures: [
                { index: 0, fieldName: 'Sig1' },
                { index: 1, fieldName: 'Sig2' },
            ],
        });
    });

    it('silently omits unknown paths (lenient)', () => {
        expect(selectFields(result, ['nope', 'metadata.missing'])).toEqual({});
    });

    it('keeps an entire subtree when the path is a container', () => {
        expect(selectFields(result, ['metadata'])).toEqual({ metadata: { title: 'Doc', author: 'A' } });
    });

    it('returns an empty object when no paths resolve', () => {
        expect(selectFields(result, [])).toEqual({});
    });
});
