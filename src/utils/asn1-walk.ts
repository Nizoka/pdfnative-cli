/**
 * Minimal ASN.1 / DER walker with **absolute** byte offsets.
 *
 * pdfnative's `derDecode` returns nodes whose `offset` is correct only at
 * depth 1 (immediate children of the root). At deeper levels, `offset` is
 * relative to an intermediate parent's `value` slice — slicing the original
 * buffer with those offsets yields garbage.
 *
 * For CMS / certificate extraction we need absolute offsets at every depth,
 * so we re-walk the buffer ourselves with explicit length-byte arithmetic.
 *
 * Scope is intentionally minimal: tag, header length, content length, and
 * children. No primitive value decoding — callers slice `bytes[abs : abs +
 * total]` themselves when they need the exact DER for hashing or
 * re-encoding (RFC 5652 §5.4).
 *
 * @internal
 */

const TAG_CONSTRUCTED = 0x20;

export interface AbsNode {
    /** ASN.1 tag byte (incl. constructed bit). */
    readonly tag: number;
    /** Absolute offset of the tag byte in the original buffer. */
    readonly abs: number;
    /** Number of header bytes (tag + length encoding). */
    readonly headerLen: number;
    /** Length of the content in bytes. */
    readonly contentLen: number;
    /** Total length = headerLen + contentLen. */
    readonly totalLen: number;
    /** Decoded children (constructed types only). */
    readonly children: readonly AbsNode[];
}

function decodeLength(buf: Uint8Array, pos: number): { length: number; nextPos: number } {
    if (pos >= buf.length) throw new Error('ASN.1: unexpected end in length');
    const first = buf[pos] as number;
    if (first < 0x80) return { length: first, nextPos: pos + 1 };
    const numBytes = first & 0x7f;
    if (numBytes === 0 || numBytes > 4) {
        throw new Error(`ASN.1: unsupported long-form length (${numBytes} bytes)`);
    }
    if (pos + 1 + numBytes > buf.length) {
        throw new Error('ASN.1: length bytes extend beyond buffer');
    }
    let v = 0;
    for (let i = 0; i < numBytes; i++) {
        v = (v << 8) | (buf[pos + 1 + i] as number);
    }
    return { length: v, nextPos: pos + 1 + numBytes };
}

/** Decode one DER node at `abs` offset in `buf`, recursively. */
export function walkAbs(buf: Uint8Array, abs = 0): AbsNode {
    if (abs >= buf.length) throw new Error(`ASN.1: unexpected end at offset ${abs}`);
    const tag = buf[abs] as number;
    const { length: contentLen, nextPos: contentStart } = decodeLength(buf, abs + 1);
    const headerLen = contentStart - abs;
    const totalLen = headerLen + contentLen;
    if (abs + totalLen > buf.length) {
        throw new Error(
            `ASN.1: value extends beyond buffer at offset ${abs} (need ${abs + totalLen}, have ${buf.length})`,
        );
    }
    const children: AbsNode[] = [];
    if ((tag & TAG_CONSTRUCTED) !== 0) {
        let p = contentStart;
        const end = contentStart + contentLen;
        while (p < end) {
            const child = walkAbs(buf, p);
            children.push(child);
            p += child.totalLen;
        }
    }
    return { tag, abs, headerLen, contentLen, totalLen, children };
}

/** Slice the full DER bytes (header + content) of a node from `buf`. */
export function sliceNode(buf: Uint8Array, node: AbsNode): Uint8Array {
    return buf.subarray(node.abs, node.abs + node.totalLen);
}

/** Slice only the content bytes of a node from `buf`. */
export function sliceContent(buf: Uint8Array, node: AbsNode): Uint8Array {
    return buf.subarray(node.abs + node.headerLen, node.abs + node.totalLen);
}
