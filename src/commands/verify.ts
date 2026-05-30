import { createHash } from 'node:crypto';
import {
    openPdf,
    ensureCryptoReady,
    parseCertificate,
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
} from '../core-bridge/index.js';
import { type ParsedArgs, getStringFlag, getStringFlagAll, hasFlag } from '../utils/args.js';
import { readFileOrStdin } from '../utils/io.js';
import { CliError } from '../utils/error.js';
import { walkAbs, sliceNode, sliceContent, type AbsNode } from '../utils/asn1-walk.js';
import { loadPemChain, parseCertificateChain } from '../utils/keys.js';
import { verifyCmsSignatureValue, extractUnsignedAttrs, extractSignerSignatureValue } from '../utils/cms-verify.js';
import { buildChain, isTrustedRoot } from '../utils/cert-chain.js';
import { verifyTimestamp } from '../utils/timestamp-verify.js';
import {
    checkRevocation,
    type RevocationMode,
    type RevocationPolicy,
    type RevocationStatus,
} from '../utils/revocation.js';


/**
 * `pdfnative-cli verify` — verify CMS/PKCS#7 signatures embedded in a PDF.
 *
 * Scope (v1.0.0):
 *   ✔ Enumerate signature fields and parse /ByteRange + /Contents
 *   ✔ Recompute SHA-256 of byte-range-covered bytes
 *   ✔ Compare with messageDigest attribute embedded in CMS SignedData (integrity)
 *   ✔ Walk certificate chain via pdfnative `verifyCertSignature`
 *   ✔ Trust evaluation against --trust roots (or self-signed acceptance)
 *   ✔ FULL CMS signature-value verification (RSA + ECDSA over signedAttrs)
 *   ✔ RFC 3161 signature-time-stamp-token validation (PAdES-T)
 *   ✔ OCSP (RFC 6960) + CRL (RFC 5280) revocation — embedded DSS (offline,
 *     default) and opt-in online fetching (--revocation online, SSRF-guarded)
 *
 * Out of scope:
 *   ✘ Sign-side LTV (embedding timestamps / DSS) — tracked upstream in pdfnative
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
    readonly timestampValid: boolean;
    readonly timestampTime: string | null;
    readonly tsaSubject: string | null;
    readonly revocationChecked: boolean;
    readonly revocationStatus: RevocationStatus;
    readonly revocationSource: 'embedded' | 'online' | 'none';
    readonly revocationMethod: 'ocsp' | 'crl' | null;
    readonly revocationRevokedAt: string | null;
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

/** Decode an OID from an `AbsNode` whose tag is OID (0x06). */
function decodeOidAbs(buf: Uint8Array, node: AbsNode): string | null {
    if (node.tag !== 0x06) return null;
    const bytes = sliceContent(buf, node);
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

/** Recursively scan an absolute-offset ASN.1 tree for the messageDigest octet string. */
function findMessageDigest(buf: Uint8Array, node: AbsNode): Uint8Array | null {
    if (node.children.length >= 2) {
        const oid = decodeOidAbs(buf, node.children[0] as AbsNode);
        if (oid === MESSAGE_DIGEST_OID) {
            const setNode = node.children[1] as AbsNode;
            if (setNode.children.length > 0) {
                const oct = setNode.children[0] as AbsNode;
                if (oct.tag === 0x04) {
                    return sliceContent(buf, oct);
                }
            }
        }
    }
    for (const child of node.children) {
        const found = findMessageDigest(buf, child);
        if (found !== null) return found;
    }
    return null;
}

/**
 * Extract certificate DER blocks from a CMS SignedData structure.
 *
 * Walks the precise CMS ASN.1 path (RFC 5652):
 *   ContentInfo SEQUENCE
 *     ├─ contentType OID
 *     └─ content [0] EXPLICIT
 *          └─ SignedData SEQUENCE
 *               ├─ version, digestAlgorithms SET, encapContentInfo, …
 *               └─ certificates [0] IMPLICIT  (← we want this)
 *                    └─ each child SEQUENCE = one X.509 certificate
 */
function extractCertsFromCms(cmsBytes: Uint8Array, root: AbsNode): Uint8Array[] {
    if (root.tag !== 0x30 || root.children.length < 2) return [];
    const explicit = root.children[1] as AbsNode;
    if (explicit.tag !== 0xa0 || explicit.children.length === 0) return [];
    const signedData = explicit.children[0] as AbsNode;
    if (signedData.tag !== 0x30) return [];

    const certs: Uint8Array[] = [];
    for (const child of signedData.children) {
        if (child.tag === 0xa0) {
            // certificates [0] IMPLICIT — children are SEQUENCEs (one per cert).
            for (const certNode of child.children) {
                if (certNode.tag === 0x30) certs.push(sliceNode(cmsBytes, certNode));
            }
            break;
        }
    }
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

/**
 * Trim trailing zero-padding from a DER-encoded blob extracted from a PDF
 * `/Contents <…>` placeholder. Returns the slice up to the encoded length of
 * the outermost ASN.1 object, or `null` when the bytes don't start with a
 * valid tag-length prefix.
 */
function trimDerToLength(bytes: Uint8Array): Uint8Array | null {
    if (bytes.length < 2) return null;
    const lenByte = bytes[1] as number;
    let totalLen: number;
    if (lenByte < 0x80) {
        totalLen = 2 + lenByte;
    } else {
        const numLenBytes = lenByte & 0x7f;
        if (numLenBytes === 0 || numLenBytes > 4) return null;
        if (bytes.length < 2 + numLenBytes) return null;
        let v = 0;
        for (let i = 0; i < numLenBytes; i++) {
            v = (v << 8) | (bytes[2 + i] as number);
        }
        totalLen = 2 + numLenBytes + v;
    }
    if (totalLen <= 0 || totalLen > bytes.length) return null;
    if (totalLen === bytes.length) return bytes;
    return bytes.slice(0, totalLen);
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
        // Trim trailing zero-padding from /Contents placeholder. The CMS
        // is the first DER object; pdfnative pads the rest with 0x00 bytes.
        if (contents !== null && contents.length >= 2) {
            const trimmed = trimDerToLength(contents);
            if (trimmed !== null) contents = trimmed;
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

// Chain construction, parent resolution, byte-equality and trust evaluation
// live in ../utils/cert-chain.ts (shared with the timestamp + revocation
// verifiers).

// ──────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────

export async function verify(args: ParsedArgs): Promise<void> {
    const inputPath = getStringFlag(args.flags, 'input', 'i');
    const format = getStringFlag(args.flags, 'format', 'f') ?? 'json';
    const strict = hasFlag(args.flags, 'strict');
    const trustPaths = getStringFlagAll(args.flags, 'trust');
    const revocationMode = (getStringFlag(args.flags, 'revocation') ?? 'offline') as RevocationMode;
    const revocationPolicy = (getStringFlag(args.flags, 'revocation-policy') ?? 'soft-fail') as RevocationPolicy;

    if (format !== 'json' && format !== 'text') {
        throw new CliError(`Invalid --format value "${format}". Valid: json, text.`, 2);
    }
    if (revocationMode !== 'offline' && revocationMode !== 'online' && revocationMode !== 'disabled') {
        throw new CliError(
            `Invalid --revocation value "${revocationMode}". Valid: offline, online, disabled.`,
            2,
        );
    }
    if (revocationPolicy !== 'soft-fail' && revocationPolicy !== 'strict') {
        throw new CliError(
            `Invalid --revocation-policy value "${revocationPolicy}". Valid: soft-fail, strict.`,
            2,
        );
    }

    // Async crypto bootstrap MUST run before any RSA/ECDSA verification.
    await ensureCryptoReady();

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

    for (let idx = 0; idx < fields.length; idx++) {
        const field = fields[idx] as (typeof fields)[number];
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
        let timestampValid = false;
        let timestampTime: string | null = null;
        let tsaSubject: string | null = null;
        let revocationChecked = false;
        let revocationStatus: RevocationStatus = 'unknown';
        let revocationSource: 'embedded' | 'online' | 'none' = 'none';
        let revocationMethod: 'ocsp' | 'crl' | null = null;
        let revocationRevokedAt: string | null = null;

        if (sig.byteRange !== null) {
            digest = digestByteRange(pdfBytes, sig.byteRange);
        } else {
            notes.push('missing /ByteRange');
        }

        if (sig.contents !== null) {
            try {
                const root = walkAbs(sig.contents);
                const certDers = extractCertsFromCms(sig.contents, root);
                if (certDers.length === 0) {
                    notes.push('no certificates embedded in CMS');
                } else {
                    const certs = certDers.map((der) => parseCertificate(der));
                    const leaf = certs[0] as X509Certificate;
                    signerSubject = nameToString(leaf.subject);
                    signerIssuer = nameToString(leaf.issuer);

                    const md = findMessageDigest(sig.contents, root);
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

                    trustedRoot = isTrustedRoot(built.root, trustRoots);
                    if (trustRoots.length === 0 && trustedRoot) {
                        notes.push('no --trust provided; accepted self-signed root');
                    } else if (!trustedRoot) {
                        notes.push('chain root not in --trust list');
                    }

                    // Full CMS signature-value verification (NEW in v0.3.0).
                    const cmsResult = verifyCmsSignatureValue(sig.contents, leaf);
                    signatureValid = cmsResult.signatureValid;
                    signatureAlgorithm = cmsResult.algorithm;
                    timestampPresent = cmsResult.timestampPresent;
                    if (!signatureValid && cmsResult.note !== null) {
                        notes.push(`CMS signature: ${cmsResult.note}`);
                    }

                    // RFC 3161 timestamp validation (PAdES-T, NEW in v1.0.0).
                    if (timestampPresent) {
                        const unsignedAttrs = extractUnsignedAttrs(sig.contents);
                        const docSigValue = extractSignerSignatureValue(sig.contents);
                        const ts = verifyTimestamp(unsignedAttrs, docSigValue, trustRoots);
                        timestampValid = ts.valid;
                        timestampTime = ts.genTime;
                        tsaSubject = ts.tsaSubject;
                        if (ts.valid) {
                            notes.push(
                                `RFC 3161 timestamp valid (genTime ${ts.genTime ?? 'unknown'}`
                                + `${ts.trusted ? ', TSA trusted' : ', TSA untrusted'})`,
                            );
                        } else {
                            notes.push(`RFC 3161 timestamp invalid${ts.note !== null ? `: ${ts.note}` : ''}`);
                        }
                    }

                    // Certificate revocation — OCSP + CRL (PAdES-LT, NEW in v1.0.0).
                    if (revocationMode !== 'disabled') {
                        const issuerCert = built.chain.length > 1 ? (built.chain[1] as X509Certificate) : null;
                        const rev = await checkRevocation(reader, leaf, issuerCert, certs, revocationMode);
                        revocationChecked = rev.checked;
                        revocationStatus = rev.status;
                        revocationSource = rev.source;
                        revocationMethod = rev.method;
                        revocationRevokedAt = rev.revokedAt;
                        if (rev.status === 'revoked') {
                            notes.push(
                                `certificate REVOKED${rev.revokedAt !== null ? ` at ${rev.revokedAt}` : ''}`
                                + ` (via ${rev.method ?? 'unknown'}, ${rev.source})`,
                            );
                        } else if (rev.checked && rev.status === 'good') {
                            notes.push(`revocation OK (via ${rev.method ?? 'unknown'}, ${rev.source})`);
                        } else if (rev.note !== null) {
                            notes.push(`revocation: ${rev.note}`);
                        }
                    }
                }
            } catch {
                // Avoid leaking ASN.1 byte offsets or internal parser state.
                notes.push('failed to parse CMS (malformed or unsupported structure)');
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
            timestampValid,
            timestampTime,
            tsaSubject,
            revocationChecked,
            revocationStatus,
            revocationSource,
            revocationMethod,
            revocationRevokedAt,
            notes,
        });
    }

    // A signature's revocation outcome blocks validity when the certificate is
    // explicitly revoked, or — under the strict policy — whenever a 'good'
    // status could not be positively established.
    const revocationOk = (r: SignatureReport): boolean => {
        if (r.revocationStatus === 'revoked') return false;
        if (revocationPolicy === 'strict') return r.revocationStatus === 'good';
        return true;
    };

    const allValid =
        reports.length > 0
        && reports.every(
            (r) => r.integrity && r.chainValid && r.trustedRoot && r.signatureValid && revocationOk(r),
        );

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
                + `    timestamp: ${r.timestampPresent ? (r.timestampValid ? `valid (${r.timestampTime ?? 'unknown time'})` : 'present but INVALID') : '—'}\n`
                + `    revocation: ${r.revocationChecked ? `${r.revocationStatus} (${r.revocationMethod ?? '—'}, ${r.revocationSource})` : '—'}\n`,
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
