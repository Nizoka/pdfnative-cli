import { describe, it, expect } from 'vitest';
import { walkAbs, sliceNode } from '../../src/utils/asn1-walk.js';

// Helper: build a TLV with short-form length.
function tlv(tag: number, content: number[]): number[] {
    return [tag, content.length, ...content];
}

describe('walkAbs', () => {
    it('decodes a primitive INTEGER at offset 0', () => {
        const buf = new Uint8Array([0x02, 0x01, 0x05]);
        const node = walkAbs(buf);
        expect(node.tag).toBe(0x02);
        expect(node.abs).toBe(0);
        expect(node.headerLen).toBe(2);
        expect(node.contentLen).toBe(1);
        expect(node.totalLen).toBe(3);
        expect(node.children).toHaveLength(0);
    });

    it('decodes a constructed SEQUENCE with two children and absolute offsets', () => {
        // SEQUENCE { INTEGER 1, INTEGER 2 }
        const seq = new Uint8Array([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02]);
        const node = walkAbs(seq);
        expect(node.tag).toBe(0x30);
        expect(node.children).toHaveLength(2);
        expect(node.children[0]?.abs).toBe(2);
        expect(node.children[1]?.abs).toBe(5);
    });

    it('decodes long-form length (0x82 0xLL 0xLL)', () => {
        // OCTET STRING with content length 300 (0x012c)
        const content = new Uint8Array(300).fill(0xaa);
        const buf = new Uint8Array(4 + 300);
        buf[0] = 0x04;
        buf[1] = 0x82;
        buf[2] = 0x01;
        buf[3] = 0x2c;
        buf.set(content, 4);
        const node = walkAbs(buf);
        expect(node.contentLen).toBe(300);
        expect(node.headerLen).toBe(4);
        expect(node.totalLen).toBe(304);
    });

    it('throws on truncated length bytes', () => {
        // 0x04 0x82 (says 2 length bytes follow) but buffer ends.
        const buf = new Uint8Array([0x04, 0x82, 0x01]);
        expect(() => walkAbs(buf)).toThrow(/length bytes extend beyond buffer/);
    });

    it('throws on unsupported long-form length > 4 bytes', () => {
        const buf = new Uint8Array([0x04, 0x85, 0, 0, 0, 0, 0]);
        expect(() => walkAbs(buf)).toThrow(/unsupported long-form length/);
    });

    it('throws when content extends beyond buffer', () => {
        // SEQUENCE with declared content length 10 but only 2 bytes follow.
        const buf = new Uint8Array([0x30, 0x0a, 0x00, 0x00]);
        expect(() => walkAbs(buf)).toThrow(/extends beyond buffer/);
    });

    it('throws on declared content length above the 50 MiB cap', () => {
        // 0x04 0x84 0x04 0x00 0x00 0x00 → 64 MiB declared
        const buf = new Uint8Array([0x04, 0x84, 0x04, 0x00, 0x00, 0x00]);
        expect(() => walkAbs(buf)).toThrow(/exceeds maximum/);
    });

    it('throws on unexpected end at offset', () => {
        expect(() => walkAbs(new Uint8Array(0))).toThrow(/unexpected end at offset/);
    });

    it('throws on missing length byte after tag', () => {
        expect(() => walkAbs(new Uint8Array([0x02]))).toThrow(/unexpected end in length/);
    });

    it('sliceNode returns a subarray covering header + content', () => {
        const inner = tlv(0x02, [0x07]);
        const seq = new Uint8Array([0x30, inner.length, ...inner, 0x02, 0x01, 0x09]);
        const node = walkAbs(seq);
        const child0 = sliceNode(seq, node.children[0]!);
        expect(Array.from(child0)).toEqual(inner);
    });
});
