import { describe, it, expect } from 'vitest';
import { verifyTimestamp, extractTimestampToken } from '../../src/utils/timestamp-verify.js';

describe('extractTimestampToken', () => {
    it('returns null for null input', () => {
        expect(extractTimestampToken(null)).toBeNull();
    });

    it('returns null when the blob does not start with the [1] tag', () => {
        expect(extractTimestampToken(new Uint8Array([0x30, 0x00]))).toBeNull();
    });
});

describe('verifyTimestamp', () => {
    it('reports absent when there are no unsigned attributes', () => {
        const r = verifyTimestamp(null, null, []);
        expect(r.present).toBe(false);
        expect(r.valid).toBe(false);
    });

    it('does not throw and stays invalid for malformed unsigned attributes', () => {
        const garbage = new Uint8Array([0xa1, 0x03, 0x01, 0x01, 0xff]);
        const r = verifyTimestamp(garbage, new Uint8Array([1, 2, 3]), []);
        expect(r.valid).toBe(false);
    });
});
