import { createHash } from 'node:crypto';
import {
    openPdf,
    derDecode,
    parseCertificate,
    verifyCertSignature,
    isSelfSigned,
    isRef,
    isName,
    isDict,
    isArray,
    nameValue,
} from '../core-bridge/index.js';
import type {
    PdfReader,
    PdfDict,
    PdfValue,
    X509Certificate,
    X509Name,
    Asn1Node,
} from '../core-bridge/index.js';
import { type ParsedArgs, getStringFlag, getStringFlagAll, hasFlag } from '../utils/args.js';
import { readFileOrStdin } from '../utils/io.js';
import { CliError } from '../utils/error.js';
import { loadPemChain, parseCertificateChain } from '../utils/keys.js';
import { verifyCmsSignatureValue } from '../utils/cms-verify.js';

/**
 * `pdfnative-cli verify` — verify CMS/PKCS#7 signatures embedded in a PDF.
 *
 * Scope (v0.3.0):
 *   ✔ Enumerate signature fields and parse /ByteRange + /Contents
 *   ✔ Recompute SHA-256 of byte-range-covered bytes
 *   ✔ Compare with messageDigest attribute embedded in CMS SignedData (integrity)
 *   ✔ Walk certificate chain via pdfnative `verifyCertSignature`
 *   ✔ Trust evaluation against --trust roots (or self-signed acceptance)
 *   ✔ FULL CMS signature-value verification (RSA + ECDSA over signedAttrs)
 *   ✔ RFC 3161 signature-time-stamp-token recognition (presence flag)
 *
 * Out of scope (deferred to v0.4.0):
 *   ✘ RFC 3161 timestamp signature validation
 *   ✘ OCSP / CRL revocation
 *   ✘ Long-Term Validation (LTV)
 */

interface SignatureReport {
    readonly index: number;
    readonly fieldName: string | null;
    readonly subFilter: string | null;
    readonly signerSubject: string | null;
    readonly signerIssuer: string | null;
    readonly signingTime: string | null;
    readonly reason: string | null;
    readonly location: string | null;
    readonly digest: string | null;
    readonly integrity: boolean;
    readonly chainValid: boolean;
    readonly trustedRoot: boolean;
    readonly signatureValid: boolean;
    readonly signatureAlgorithm: 'rsa-sha256' | 'ecdsa-sha256' | null;
    readonly timestampPresent: boolean;
    readonly notes: readonly string[];
}

interface VerifyResult {
    readonly signatures: readonly SignatureReport[];
    readonly allValid: boolean;
}

// ──────────────────────────────────────────────────────────────────────
// Byte / hex helpers
// ──────────────────────────────────────────────────────────────────────

function decodeHexString(hex: string): Uint8Array {
    const clean = hex.replace(/\s+/g, '');
    if (clean.length % 2 !== 0) {
        throw new Error('hex string has odd length');
    }
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) {
        out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
}

function bytesToHex(bytes: Uint8Array): string {
    let s = '';
    for (let i = 0; i < bytes.length; i++) {
        s += (bytes[i] as number).toString(16).padStart(2, '0');
    }
    return s;
}

function digestByteRange(
    pdfBytes: Uint8Array,
    byteRange: readonly [number, number, number, number],
): string {
    const [a, b, c, d] = byteRange;
    const hash = createHash('sha256');
    hash.update(pdfBytes.subarray(a, a + b));
    hash.update(pdfBytes.subarray(c, c + d));
    return hash.digest('hex');
}

// ──────────────────────────────────────────────────────────────────────
// ASN.1 / CMS helpers
// ──────────────────────────────────────────────────────────────────────

const MESSAGE_DIGEST_OID = '1.2.840.113549.1.9.4';

function decodeOid(node: Asn1Node): string | null {
    if (node.tag !== 0x06) return null;
    const bytes = node.value;
    if (bytes.length === 0) return null;
    const first = bytes[0] as number;
    const parts: number[] = [Math.floor(first / 40), first % 40];
    let v = 0;
    for (let i = 1; i < bytes.length; i++) {
        const byte = bytes[i] as number;
        v = (v << 7) | (byte & 0x7f);
        if ((byte & 0x80) === 0) {
            parts.push(v);
            v = 0;
        }
    }
    return parts.join('.');
}

/** Recursively scan an ASN.1 tree for the messageDigest attribute octet string. */
function findMessageDigest(node: Asn1Node): Uint8Array | null {
    if (node.children.length >= 2) {
        const oid = decodeOid(node.children[0] as Asn1Node);
        if (oid === MESSAGE_DIGEST_OID) {
            const setNode = node.children[1] as Asn1Node;
            if (setNode.children.length > 0) {
                const oct = setNode.children[0] as Asn1Node;
                if (oct.tag === 0x04) {
                    return oct.value;
                }
            }
        }
    }
    for (const child of node.children) {
        const found = findMessageDigest(child);
        if (found !== null) return found;
    }
    return null;
}

/**
 * Extract certificate DER blocks from a CMS SignedData structure.
 * Walks the parsed ASN.1 tree looking for [0] IMPLICIT (tag 0xa0) — the
 * `certificates` field of SignedData. Each child SEQUENCE is one cert.
 */
function extractCertsFromCms(cmsBytes: Uint8Array, root: Asn1Node): Uint8Array[] {
    const certs: Uint8Array[] = [];
    const visit = (node: Asn1Node): void => {
        if (node.tag === 0xa0 && node.children.length > 0) {
            for (const child of node.children) {
                if (child.tag === 0x30) {
                    certs.push(cmsBytes.subarray(child.offset, child.offset + child.totalLength));
                }
            }
        }
        for (const child of node.children) visit(child);
    };
    visit(root);
    return certs;
}

// ──────────────────────────────────────────────────────────────────────
// PDF helpers
// ──────────────────────────────────────────────────────────────────────

function nameToString(name: X509Name | undefined): string | null {
    if (name === undefined) return null;
    const parts: string[] = [];
    if (name.cn !== undefined) parts.push(`CN=${name.cn}`);
    if (name.o !== undefined) parts.push(`O=${name.o}`);
    if (name.ou !== undefined) parts.push(`OU=${name.ou}`);
    if (name.c !== undefined) parts.push(`C=${name.c}`);
    return parts.length > 0 ? parts.join(', ') : null;
}

function resolveValue(reader: PdfReader, val: PdfValue | undefined): PdfValue | null {
    if (val === undefined) return null;
    if (isRef(val)) {
        try {
            return reader.resolveValue(val);
        } catch {
            return null;
        }
    }
    return val;
}

function getDictString(dict: PdfDict, key: string): string | null {
    const v = dict.get(key);
    return typeof v === 'string' ? v : null;
}

function getDictName(dict: PdfDict, key: string): string | null {
    const v = dict.get(key);
    return v !== undefined && isName(v) ? nameValue(v) ?? null : null;
}

interface SignatureField {
    readonly fieldName: string | null;
    readonly sigDict: PdfDict;
}

function findSignatureFields(reader: PdfReader): readonly SignatureField[] {
    try {
        const catalog = reader.getCatalog();
        const acroVal = resolveValue(reader, catalog.get('AcroForm'));
        if (acroVal === null || !isDict(acroVal)) return [];
        const fieldsVal = resolveValue(reader, acroVal.get('Fields'));
        if (fieldsVal === null || !isArray(fieldsVal)) return [];

        const out: SignatureField[] = [];
        for (const fieldRef of fieldsVal) {
            const field = resolveValue(reader, fieldRef);
            if (field === null || !isDict(field)) continue;
            if (getDictName(field, 'FT') !== 'Sig') continue;
            const sigVal = resolveValue(reader, field.get('V'));
            if (sigVal === null || !isDict(sigVal)) continue;
            out.push({
                fieldName: getDictString(field, 'T'),
                sigDict: sigVal,
            });
        }
        return out;
    } catch {
        return [];
    }
}

interface ParsedSignature {
    readonly byteRange: readonly [number, number, number, number] | null;
    readonly contents: Uint8Array | null;
    readonly subFilter: string | null;
    readonly signingTime: string | null;
    readonly reason: string | null;
    readonly location: string | null;
}

function parseSignatureDict(dict: PdfDict): ParsedSignature {
    const brVal = dict.get('ByteRange');
    let byteRange: readonly [number, number, number, number] | null = null;
    if (Array.isArray(brVal) && brVal.length === 4 && brVal.every((n) => typeof n === 'number')) {
        byteRange = [
            brVal[0] as number,
            brVal[1] as number,
            brVal[2] as number,
            brVal[3] as number,
        ];
    }

    const contentsRaw = dict.get('Contents');
    let contents: Uint8Array | null = null;
    if (typeof contentsRaw === 'string') {
        // pdfnative exposes hex strings as plain strings — most often already decoded
        // or in hex form. Try hex first.
        const stripped = contentsRaw.replace(/^</, '').replace(/>$/, '').trim();
        if (/^[0-9a-fA-F\s]+$/.test(stripped) && stripped.length > 0) {
            try {
                contents = decodeHexString(stripped);
            } catch {
                contents = null;
            }
        }
        if (contents === null) {
            // Fallback: treat as raw bytes (PDFDocEncoding-like 1:1 mapping)
            const raw = new Uint8Array(contentsRaw.length);
            for (let i = 0; i < contentsRaw.length; i++) {
                raw[i] = contentsRaw.charCodeAt(i) & 0xff;
            }
            contents = raw;
        }
    }

    return {
        byteRange,
        contents,
        subFilter: getDictName(dict, 'SubFilter'),
        signingTime: getDictString(dict, 'M'),
        reason: getDictString(dict, 'Reason'),
        location: getDictString(dict, 'Location'),
    };
}

// ──────────────────────────────────────────────────────────────────────
// Certificate chain
// ──────────────────────────────────────────────────────────────────────

function findChainParent(
    cert: X509Certificate,
    candidates: readonly X509Certificate[],
): X509Certificate | undefined {
    for (const c of candidates) {
        if (c === cert) continue;
        try {
            if (verifyCertSignature(cert, c)) return c;
        } catch {
            // ignore — try next candidate
        }
    }
    return undefined;
}

function buildChain(
    leaf: X509Certificate,
    pool: readonly X509Certificate[],
): { chain: X509Certificate[]; chainValid: boolean; root: X509Certificate } {
    const chain: X509Certificate[] = [leaf];
    let current = leaf;
    let chainValid = true;
    const seen = new Set<X509Certificate>([leaf]);
    while (!isSelfSigned(current)) {
        const parent = findChainParent(current, pool);
        if (parent === undefined || seen.has(parent)) {
            chainValid = false;
            break;
        }
        chain.push(parent);
        seen.add(parent);
        current = parent;
    }
    return { chain, chainValid, root: current };
}

function certEquals(a: X509Certificate, b: X509Certificate): boolean {
    if (a.raw.length !== b.raw.length) return false;
    for (let i = 0; i < a.raw.length; i++) {
        if (a.raw[i] !== b.raw[i]) return false;
    }
    return true;
}

// ──────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────

export async function verify(args: ParsedArgs): Promise<void> {
    const inputPath = getStringFlag(args.flags, 'input', 'i');
    const format = getStringFlag(args.flags, 'format', 'f') ?? 'json';
    const strict = hasFlag(args.flags, 'strict');
    const trustPaths = getStringFlagAll(args.flags, 'trust');

    if (format !== 'json' && format !== 'text') {
        throw new CliError(`Invalid --format value "${format}". Valid: json, text.`, 2);
    }

    const trustPemBlocks = await loadPemChain('PDFNATIVE_VERIFY_TRUST', trustPaths);
    const trustRoots = trustPemBlocks.length > 0 ? parseCertificateChain(trustPemBlocks) : [];

    const inputBuf = await readFileOrStdin(inputPath);
    const pdfBytes = new Uint8Array(inputBuf);

    let reader: PdfReader;
    try {
        reader = openPdf(pdfBytes);
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        throw new CliError(`Failed to read PDF: ${message}`, 1);
    }

    const fields = findSignatureFields(reader);
    const reports: SignatureReport[] = [];

    fields.forEach((field, idx) => {
        const notes: string[] = [];
        const sig = parseSignatureDict(field.sigDict);
        let digest: string | null = null;
        let integrity = false;
        let signerSubject: string | null = null;
        let signerIssuer: string | null = null;
        let chainValid = false;
        let trustedRoot = false;
        let signatureValid = false;
        let signatureAlgorithm: 'rsa-sha256' | 'ecdsa-sha256' | null = null;
        let timestampPresent = false;

        if (sig.byteRange !== null) {
            digest = digestByteRange(pdfBytes, sig.byteRange);
        } else {
            notes.push('missing /ByteRange');
        }

        if (sig.contents !== null) {
            try {
                const root = derDecode(sig.contents);
                const certDers = extractCertsFromCms(sig.contents, root);
                if (certDers.length === 0) {
                    notes.push('no certificates embedded in CMS');
                } else {
                    const certs = certDers.map((der) => parseCertificate(der));
                    const leaf = certs[0] as X509Certificate;
                    signerSubject = nameToString(leaf.subject);
                    signerIssuer = nameToString(leaf.issuer);

                    const md = findMessageDigest(root);
                    if (md !== null && digest !== null) {
                        integrity = bytesToHex(md) === digest;
                        if (!integrity) {
                            notes.push('messageDigest mismatch — content tampered after signing');
                        }
                    } else {
                        notes.push('messageDigest attribute not found in CMS');
                    }

                    const pool = [...certs, ...trustRoots];
                    const built = buildChain(leaf, pool);
                    chainValid = built.chainValid;
                    if (!chainValid) {
                        notes.push('chain incomplete (no parent for an intermediate cert)');
                    }

                    if (trustRoots.length === 0) {
                        trustedRoot = isSelfSigned(built.root);
                        if (trustedRoot) {
                            notes.push('no --trust provided; accepted self-signed root');
                        }
                    } else {
                        trustedRoot = trustRoots.some((t) => certEquals(t, built.root));
                        if (!trustedRoot) notes.push('chain root not in --trust list');
                    }

                    // Full CMS signature-value verification (NEW in v0.3.0).
                    const cmsResult = verifyCmsSignatureValue(sig.contents, leaf);
                    signatureValid = cmsResult.signatureValid;
                    signatureAlgorithm = cmsResult.algorithm;
                    timestampPresent = cmsResult.timestampPresent;
                    if (!signatureValid && cmsResult.note !== null) {
                        notes.push(`CMS signature: ${cmsResult.note}`);
                    }
                    if (timestampPresent) {
                        notes.push('RFC 3161 timestamp token present (recognised, not validated)');
                    }
                }
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                notes.push(`failed to parse CMS: ${msg}`);
            }
        } else {
            notes.push('missing /Contents');
        }

        reports.push({
            index: idx,
            fieldName: field.fieldName,
            subFilter: sig.subFilter,
            signerSubject,
            signerIssuer,
            signingTime: sig.signingTime,
            reason: sig.reason,
            location: sig.location,
            digest,
            integrity,
            chainValid,
            trustedRoot,
            signatureValid,
            signatureAlgorithm,
            timestampPresent,
            notes,
        });
    });

    const allValid =
        reports.length > 0
        && reports.every((r) => r.integrity && r.chainValid && r.trustedRoot && r.signatureValid);

    const result: VerifyResult = { signatures: reports, allValid };

    if (format === 'json') {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } else {
        process.stdout.write(`Signatures: ${reports.length}\n`);
        for (const r of reports) {
            process.stdout.write(
                `\n[${r.index}] field=${r.fieldName ?? '—'} subFilter=${r.subFilter ?? '—'}\n`
                + `    signer:    ${r.signerSubject ?? '—'}\n`
                + `    issuer:    ${r.signerIssuer ?? '—'}\n`
                + `    signed at: ${r.signingTime ?? '—'}\n`
                + `    algorithm: ${r.signatureAlgorithm ?? '—'}\n`
                + `    integrity: ${r.integrity ? 'OK' : 'FAIL'}\n`
                + `    signature: ${r.signatureValid ? 'OK' : 'FAIL'}\n`
                + `    chain:     ${r.chainValid ? 'valid' : 'invalid'}\n`
                + `    trust:     ${r.trustedRoot ? 'trusted' : 'untrusted'}\n`
                + `    timestamp: ${r.timestampPresent ? 'present' : '—'}\n`,
            );
            if (r.notes.length > 0) {
                process.stdout.write(`    notes:     ${r.notes.join('; ')}\n`);
            }
        }
        process.stdout.write(
            `\nResult: ${allValid ? 'all signatures valid' : 'one or more checks failed'}\n`,
        );
    }

    if (strict && !allValid) {
        throw new CliError('', 1);
    }
}
