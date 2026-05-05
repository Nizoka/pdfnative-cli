import { describe, it, expect } from 'vitest';
import { hasSignaturePlaceholder } from '../../src/utils/sign-placeholder.js';

function ascii(s: string): Uint8Array {
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
}

describe('hasSignaturePlaceholder', () => {
    it('returns false for an empty buffer', () => {
        expect(hasSignaturePlaceholder(new Uint8Array(0))).toBe(false);
    });

    it('returns false when only the ByteRange marker is present', () => {
        const bytes = ascii('xxx /ByteRange [0 0000000000 0000000000 0000000000] xxx');
        expect(hasSignaturePlaceholder(bytes)).toBe(false);
    });

    it('returns false when only the Contents marker is present', () => {
        const bytes = ascii('xxx /Contents <000000> xxx');
        expect(hasSignaturePlaceholder(bytes)).toBe(false);
    });

    it('returns true when both signature-placeholder markers are present', () => {
        const bytes = ascii(
            '%PDF-1.4 /ByteRange [0 0000000000 0000000000 0000000000] /Contents <0000>',
        );
        expect(hasSignaturePlaceholder(bytes)).toBe(true);
    });
});
