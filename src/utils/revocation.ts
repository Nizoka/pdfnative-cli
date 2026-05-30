// Certificate revocation checking — OCSP (RFC 6960) and CRL (RFC 5280).
//
// Two sources, in priority order:
//   1. EMBEDDED (offline, default): OCSP responses and CRLs stapled into the
//      PDF's Document Security Store (PAdES-LT `/DSS`).
//   2. ONLINE (opt-in, `--revocation online`): fetched from the certificate's
//      Authority Information Access (OCSP) and CRL Distribution Points (CRL)
//      extensions, through the SSRF-guarded client in fetch-guard.ts.
//
// All signatures (OCSP `tbsResponseData`, CRL `tbsCertList`) are cryptographically
// verified against the issuing certificate via cms-verify. Nothing here trusts
// a response it cannot verify.

import { createHash } from 'node:crypto';
import { walkAbs, sliceNode, sliceContent, type AbsNode } from './asn1-walk.js';
import { decodeOid, verifySignedStructure } from './cms-verify.js';
import { certEquals } from './cert-chain.js';
import {
    verifyCertSignature,
    isSelfSigned,
    isStream,
    isDict,
    isArray,
    isRef,
    parseCertificate,
} from '../core-bridge/index.js';
import type { PdfReader, PdfDict, PdfValue, X509Certificate } from '../core-bridge/index.js';
import { guardedFetch } from './fetch-guard.js';

// ── OIDs ──────────────────────────────────────────────────────────────

const OID_OCSP_BASIC = '1.3.6.1.5.5.7.48.1.1';
const OID_AD_OCSP = '1.3.6.1.5.5.7.48.1';
const OID_AIA = '1.3.6.1.5.5.7.1.1';
const OID_CRL_DP = '2.5.29.31';
const OID_SHA1 = '1.3.14.3.2.26';
const OID_SHA256 = '2.16.840.1.101.3.4.2.1';

const DIGEST_BY_OID: Readonly<Record<string, string>> = {
    [OID_SHA1]: 'sha1',
    [OID_SHA256]: 'sha256',
};

// ── Public types ──────────────────────────────────────────────────────

export type RevocationMode = 'offline' | 'online' | 'disabled';
export type RevocationPolicy = 'strict' | 'soft-fail';
export type RevocationStatus = 'good' | 'revoked' | 'unknown';

export interface RevocationResult {
    readonly checked: boolean;
    readonly status: RevocationStatus;
    readonly source: 'embedded' | 'online' | 'none';
    readonly method: 'ocsp' | 'crl' | null;
    readonly revokedAt: string | null;
    readonly note: string | null;
}

const NOT_CHECKED: RevocationResult = {
    checked: false,
    status: 'unknown',
    source: 'none',
    method: null,
    revokedAt: null,
    note: null,
};

// ── Small helpers ─────────────────────────────────────────────────────

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
    let v = 0n;
    for (let i = 0; i < bytes.length; i++) v = (v << 8n) | BigInt(bytes[i] as number);
    return v;
}

/** BIT STRING content → signature bytes (drop the leading unused-bits byte). */
function bitStringBytes(buf: Uint8Array, node: AbsNode): Uint8Array {
    const content = sliceContent(buf, node);
    return content.length > 0 ? content.subarray(1) : content;
}

function decodeGeneralizedTime(bytes: Uint8Array): string | null {
    const s = new TextDecoder('latin1').decode(bytes).trim();
    const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.(\d+))?Z?$/.exec(s);
    if (m === null) return null;
    const [, y, mo, d, h, mi, sec, frac] = m;
    const t = new Date(`${y}-${mo}-${d}T${h}:${mi}:${sec}${frac ? '.' + frac : ''}Z`);
    return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

function decodeUtcTime(bytes: Uint8Array): string | null {
    const s = new TextDecoder('latin1').decode(bytes).trim();
    const m = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?Z?$/.exec(s);
    if (m === null) return null;
    const [, yy, mo, d, h, mi, sec] = m;
    const year = Number.parseInt(yy as string, 10);
    const fullYear = year >= 50 ? 1900 + year : 2000 + year;
    const t = new Date(`${fullYear}-${mo}-${d}T${h}:${mi}:${sec ?? '00'}Z`);
    return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

function decodeTime(buf: Uint8Array, node: AbsNode): string | null {
    if (node.tag === 0x17) return decodeUtcTime(sliceContent(buf, node));
    if (node.tag === 0x18) return decodeGeneralizedTime(sliceContent(buf, node));
    return null;
}

// ── Certificate extension extraction (AIA / CRL DP) ───────────────────

/** Return the `extnValue` OCTET STRING content for `extnOid`, or null. */
function extractCertExtension(cert: X509Certificate, extnOid: string): Uint8Array | null {
    let tbs: AbsNode;
    try {
        tbs = walkAbs(cert.tbsCertificateBytes);
    } catch {
        return null;
    }
    if (tbs.tag !== 0x30) return null;
    const extsContainer = tbs.children.find((c) => c.tag === 0xa3); // extensions [3] EXPLICIT
    if (extsContainer === undefined || extsContainer.children.length === 0) return null;
    const extsSeq = extsContainer.children[0] as AbsNode;
    if (extsSeq.tag !== 0x30) return null;
    for (const ext of extsSeq.children) {
        if (ext.tag !== 0x30 || ext.children.length < 2) continue;
        if (decodeOid(cert.tbsCertificateBytes, ext.children[0] as AbsNode) !== extnOid) continue;
        const valueNode = ext.children[ext.children.length - 1] as AbsNode;
        if (valueNode.tag !== 0x04) return null;
        return sliceContent(cert.tbsCertificateBytes, valueNode).slice();
    }
    return null;
}

/** Parse an Authority Information Access extension for the OCSP responder URL. */
function extractOcspUrl(cert: X509Certificate): string | null {
    const extn = extractCertExtension(cert, OID_AIA);
    if (extn === null) return null;
    let aia: AbsNode;
    try {
        aia = walkAbs(extn);
    } catch {
        return null;
    }
    if (aia.tag !== 0x30) return null;
    for (const access of aia.children) {
        if (access.tag !== 0x30 || access.children.length < 2) continue;
        if (decodeOid(extn, access.children[0] as AbsNode) !== OID_AD_OCSP) continue;
        const loc = access.children[1] as AbsNode;
        if (loc.tag === 0x86) {
            // [6] IMPLICIT uniformResourceIdentifier
            return new TextDecoder('latin1').decode(sliceContent(extn, loc)).trim();
        }
    }
    return null;
}

/** Parse a CRL Distribution Points extension for the first HTTP(S) CRL URL. */
function extractCrlUrl(cert: X509Certificate): string | null {
    const extn = extractCertExtension(cert, OID_CRL_DP);
    if (extn === null) return null;
    let urls: string[] = [];
    try {
        const dps = walkAbs(extn);
        collectUriStrings(extn, dps, urls);
    } catch {
        return null;
    }
    urls = urls.filter((u) => u.startsWith('http://') || u.startsWith('https://'));
    return urls.length > 0 ? (urls[0] as string) : null;
}

/** Recursively collect all `[6] URI` GeneralName strings under a node. */
function collectUriStrings(buf: Uint8Array, node: AbsNode, out: string[]): void {
    if (node.tag === 0x86) {
        out.push(new TextDecoder('latin1').decode(sliceContent(buf, node)).trim());
        return;
    }
    for (const child of node.children) collectUriStrings(buf, child, out);
}

// ── CRL parsing & verification ────────────────────────────────────────

/**
 * Check a DER CRL for `subjectCert`'s serial. Returns 'revoked' (with date),
 * 'good' (signature verified, serial absent), or 'unknown' (cannot verify).
 */
function checkCrl(
    crlDer: Uint8Array,
    subjectCert: X509Certificate,
    issuerCert: X509Certificate,
): { status: RevocationStatus; revokedAt: string | null } {
    let root: AbsNode;
    try {
        root = walkAbs(crlDer);
    } catch {
        return { status: 'unknown', revokedAt: null };
    }
    if (root.tag !== 0x30 || root.children.length < 3) return { status: 'unknown', revokedAt: null };
    const tbs = root.children[0] as AbsNode;
    const sigAlg = root.children[1] as AbsNode;
    const sigBits = root.children[2] as AbsNode;
    if (tbs.tag !== 0x30 || sigAlg.tag !== 0x30 || sigBits.tag !== 0x03) {
        return { status: 'unknown', revokedAt: null };
    }

    // Verify CRL signature with the issuer's public key.
    const sigAlgOid = sigAlg.children.length > 0 ? decodeOid(crlDer, sigAlg.children[0] as AbsNode) : null;
    const tbsBytes = sliceNode(crlDer, tbs);
    const sigBytes = bitStringBytes(crlDer, sigBits);
    if (!verifySignedStructure(tbsBytes, sigAlgOid, sigBytes, issuerCert)) {
        return { status: 'unknown', revokedAt: null };
    }

    // Locate revokedCertificates: the SEQUENCE whose children are all 2–3
    // element SEQUENCEs beginning with an INTEGER serial.
    for (const child of tbs.children) {
        if (child.tag !== 0x30 || child.children.length === 0) continue;
        const first = child.children[0] as AbsNode;
        if (first.tag !== 0x30) continue;
        if (first.children.length < 2 || (first.children[0] as AbsNode).tag !== 0x02) continue;
        // This is the revokedCertificates list.
        for (const entry of child.children) {
            if (entry.tag !== 0x30 || entry.children.length < 2) continue;
            const serialNode = entry.children[0] as AbsNode;
            if (serialNode.tag !== 0x02) continue;
            const serial = bytesToBigInt(sliceContent(crlDer, serialNode));
            if (serial === subjectCert.serialNumber) {
                const revokedAt = decodeTime(crlDer, entry.children[1] as AbsNode);
                return { status: 'revoked', revokedAt };
            }
        }
        // Serial not present in this CRL → good (signature already verified).
        return { status: 'good', revokedAt: null };
    }
    // No revokedCertificates list (empty CRL) → good.
    return { status: 'good', revokedAt: null };
}

// ── OCSP parsing & verification ───────────────────────────────────────

/**
 * Check a DER OCSP response for `subjectCert`. Verifies the responder
 * signature and matches the CertID before reading the status.
 */
function checkOcsp(
    ocspDer: Uint8Array,
    subjectCert: X509Certificate,
    issuerCert: X509Certificate,
    candidateResponders: readonly X509Certificate[],
): { status: RevocationStatus; revokedAt: string | null } {
    let root: AbsNode;
    try {
        root = walkAbs(ocspDer);
    } catch {
        return { status: 'unknown', revokedAt: null };
    }
    // OCSPResponse ::= SEQUENCE { responseStatus ENUMERATED, responseBytes [0] }
    if (root.tag !== 0x30 || root.children.length < 1) return { status: 'unknown', revokedAt: null };
    const statusNode = root.children[0] as AbsNode;
    if (statusNode.tag !== 0x0a) return { status: 'unknown', revokedAt: null };
    const responseStatus = sliceContent(ocspDer, statusNode)[0] ?? 6;
    if (responseStatus !== 0) return { status: 'unknown', revokedAt: null };
    const responseBytes = root.children.find((c) => c.tag === 0xa0);
    if (responseBytes === undefined || responseBytes.children.length === 0) {
        return { status: 'unknown', revokedAt: null };
    }
    const rb = responseBytes.children[0] as AbsNode; // ResponseBytes SEQUENCE
    if (rb.tag !== 0x30 || rb.children.length < 2) return { status: 'unknown', revokedAt: null };
    if (decodeOid(ocspDer, rb.children[0] as AbsNode) !== OID_OCSP_BASIC) {
        return { status: 'unknown', revokedAt: null };
    }
    const respOct = rb.children[1] as AbsNode;
    if (respOct.tag !== 0x04) return { status: 'unknown', revokedAt: null };
    const basicDer = sliceContent(ocspDer, respOct).slice();

    let basic: AbsNode;
    try {
        basic = walkAbs(basicDer);
    } catch {
        return { status: 'unknown', revokedAt: null };
    }
    // BasicOCSPResponse ::= SEQUENCE { tbsResponseData, signatureAlgorithm, signature BIT STRING, certs [0]? }
    if (basic.tag !== 0x30 || basic.children.length < 3) return { status: 'unknown', revokedAt: null };
    const tbsResponseData = basic.children[0] as AbsNode;
    const sigAlg = basic.children[1] as AbsNode;
    const sigBits = basic.children[2] as AbsNode;
    if (tbsResponseData.tag !== 0x30 || sigBits.tag !== 0x03) {
        return { status: 'unknown', revokedAt: null };
    }

    // Collect responder certs embedded in the BasicOCSPResponse.
    const embedded: X509Certificate[] = [];
    const certsContainer = basic.children.find((c) => c.tag === 0xa0);
    if (certsContainer !== undefined && certsContainer.children.length > 0) {
        const certsSeq = certsContainer.children[0] as AbsNode;
        if (certsSeq.tag === 0x30) {
            for (const certNode of certsSeq.children) {
                if (certNode.tag !== 0x30) continue;
                try {
                    embedded.push(parseCertificate(sliceNode(basicDer, certNode)));
                } catch {
                    // ignore malformed embedded cert
                }
            }
        }
    }

    // Verify the responder signature: the responder must be the issuer itself
    // or a certificate authorised (signed) by the issuer.
    const sigAlgOid = sigAlg.children.length > 0 ? decodeOid(basicDer, sigAlg.children[0] as AbsNode) : null;
    const tbsBytes = sliceNode(basicDer, tbsResponseData);
    const sigBytes = bitStringBytes(basicDer, sigBits);

    const responderPool = [issuerCert, ...embedded, ...candidateResponders];
    let verified = false;
    for (const responder of responderPool) {
        if (!verifySignedStructure(tbsBytes, sigAlgOid, sigBytes, responder)) continue;
        // Authorisation: responder is the issuer, or issued by the issuer.
        if (certEquals(responder, issuerCert)) {
            verified = true;
            break;
        }
        try {
            if (verifyCertSignature(responder, issuerCert)) {
                verified = true;
                break;
            }
        } catch {
            // not authorised by this issuer
        }
    }
    if (!verified) return { status: 'unknown', revokedAt: null };

    // Find the matching SingleResponse and read its status.
    return readOcspSingleResponse(basicDer, tbsResponseData, subjectCert, issuerCert);
}

function readOcspSingleResponse(
    buf: Uint8Array,
    tbsResponseData: AbsNode,
    subjectCert: X509Certificate,
    issuerCert: X509Certificate,
): { status: RevocationStatus; revokedAt: string | null } {
    // ResponseData ::= SEQUENCE { version[0]?, responderID, producedAt, responses SEQ OF SingleResponse, ... }
    const responses = tbsResponseData.children.find(
        (c) => c.tag === 0x30 && c.children.length > 0 && (c.children[0] as AbsNode).tag === 0x30
            && (c.children[0] as AbsNode).children.length > 0
            && ((c.children[0] as AbsNode).children[0] as AbsNode).tag === 0x30,
    );
    if (responses === undefined) return { status: 'unknown', revokedAt: null };

    for (const single of responses.children) {
        if (single.tag !== 0x30 || single.children.length < 2) continue;
        const certId = single.children[0] as AbsNode;
        if (!ocspCertIdMatches(buf, certId, subjectCert, issuerCert)) continue;

        const certStatus = single.children[1] as AbsNode;
        // certStatus: [0] good (0x80), [1] revoked (0xA1), [2] unknown (0x82)
        if (certStatus.tag === 0x80) return { status: 'good', revokedAt: null };
        if (certStatus.tag === 0xa1) {
            const revokedAt =
                certStatus.children.length > 0
                    ? decodeTime(buf, certStatus.children[0] as AbsNode)
                    : null;
            return { status: 'revoked', revokedAt };
        }
        return { status: 'unknown', revokedAt: null };
    }
    return { status: 'unknown', revokedAt: null };
}

function ocspCertIdMatches(
    buf: Uint8Array,
    certId: AbsNode,
    subjectCert: X509Certificate,
    issuerCert: X509Certificate,
): boolean {
    if (certId.tag !== 0x30 || certId.children.length < 4) return false;
    const algId = certId.children[0] as AbsNode;
    const nameHashNode = certId.children[1] as AbsNode;
    const keyHashNode = certId.children[2] as AbsNode;
    const serialNode = certId.children[3] as AbsNode;
    if (serialNode.tag !== 0x02) return false;
    if (bytesToBigInt(sliceContent(buf, serialNode)) !== subjectCert.serialNumber) return false;

    const hashOid = algId.children.length > 0 ? decodeOid(buf, algId.children[0] as AbsNode) : null;
    const digest = hashOid !== null ? DIGEST_BY_OID[hashOid] : undefined;
    if (digest === undefined) return false;

    // NOTE: `digest` is whatever algorithm the responder put in the CertID
    // (often SHA-1 per RFC 6960 §B.1, sometimes SHA-256). The hash here is a
    // non-security *identifier* over the issuer's PUBLIC name and public key
    // — not an integrity/signature primitive. OCSP trust comes from the
    // responder signature, verified separately. SHA-1 here is therefore safe
    // and required for interoperability (NIST SP 800-131A permits SHA-1 for
    // non-signature uses). See SECURITY.md § "Cryptographic algorithm usage".
    const nameHash = new Uint8Array(createHash(digest).update(issuerCert.subject.raw).digest());
    const keyHash = new Uint8Array(createHash(digest).update(issuerCert.publicKeyBytes).digest());
    return (
        bytesEqual(sliceContent(buf, nameHashNode), nameHash)
        && bytesEqual(sliceContent(buf, keyHashNode), keyHash)
    );
}

// ── DSS extraction ────────────────────────────────────────────────────

function resolve(reader: PdfReader, val: PdfValue | undefined): PdfValue | null {
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

function readStreamArray(reader: PdfReader, dssDict: PdfDict, key: string): Uint8Array[] {
    const arr = resolve(reader, dssDict.get(key));
    if (arr === null || !isArray(arr)) return [];
    const out: Uint8Array[] = [];
    for (const item of arr) {
        const stream = resolve(reader, item);
        if (stream === null || !isStream(stream)) continue;
        try {
            out.push(reader.decodeStream(stream));
        } catch {
            // ignore undecodable stream
        }
    }
    return out;
}

interface DssData {
    readonly ocsps: readonly Uint8Array[];
    readonly crls: readonly Uint8Array[];
}

/** Read embedded OCSP responses and CRLs from the PDF `/DSS` dictionary. */
export function extractDss(reader: PdfReader): DssData {
    try {
        const catalog = reader.getCatalog();
        const dss = resolve(reader, catalog.get('DSS'));
        if (dss === null || !isDict(dss)) return { ocsps: [], crls: [] };
        return {
            ocsps: readStreamArray(reader, dss, 'OCSPs'),
            crls: readStreamArray(reader, dss, 'CRLs'),
        };
    } catch {
        return { ocsps: [], crls: [] };
    }
}

// ── Orchestration ─────────────────────────────────────────────────────

/**
 * Resolve the revocation status of `subjectCert`.
 *
 * @param reader        Reader over the PDF (for `/DSS` extraction).
 * @param subjectCert   The signer certificate to check.
 * @param issuerCert    Its issuer (for CertID + signature verification). When
 *                      null, or when the subject is self-signed, no authority
 *                      exists and the result is `unknown` / not-checked.
 * @param embeddedCerts CMS-embedded certs (potential OCSP responders).
 * @param mode          offline (embedded only), online (AIA/CDP fetch), disabled.
 */
export async function checkRevocation(
    reader: PdfReader,
    subjectCert: X509Certificate,
    issuerCert: X509Certificate | null,
    embeddedCerts: readonly X509Certificate[],
    mode: RevocationMode,
): Promise<RevocationResult> {
    if (mode === 'disabled') return NOT_CHECKED;
    if (issuerCert === null || isSelfSigned(subjectCert)) {
        return { ...NOT_CHECKED, note: 'no revocation authority (self-signed or issuer unknown)' };
    }

    // 1. Embedded DSS (offline, always tried first).
    const dss = extractDss(reader);
    for (const ocsp of dss.ocsps) {
        const r = checkOcsp(ocsp, subjectCert, issuerCert, embeddedCerts);
        if (r.status !== 'unknown') {
            return { checked: true, status: r.status, source: 'embedded', method: 'ocsp', revokedAt: r.revokedAt, note: null };
        }
    }
    for (const crl of dss.crls) {
        const r = checkCrl(crl, subjectCert, issuerCert);
        if (r.status !== 'unknown') {
            return { checked: true, status: r.status, source: 'embedded', method: 'crl', revokedAt: r.revokedAt, note: null };
        }
    }

    if (mode === 'offline') {
        return { ...NOT_CHECKED, note: 'no embedded OCSP/CRL found (use --revocation online to fetch)' };
    }

    // 2. Online (opt-in): OCSP via AIA, then CRL via CDP.
    const ocspUrl = extractOcspUrl(subjectCert);
    if (ocspUrl !== null) {
        try {
            const request = buildOcspRequest(subjectCert, issuerCert);
            const res = await guardedFetch(ocspUrl, {
                method: 'POST',
                body: request,
                contentType: 'application/ocsp-request',
                accept: 'application/ocsp-response',
            });
            if (res.status === 200) {
                const r = checkOcsp(res.body, subjectCert, issuerCert, embeddedCerts);
                if (r.status !== 'unknown') {
                    return { checked: true, status: r.status, source: 'online', method: 'ocsp', revokedAt: r.revokedAt, note: null };
                }
            }
        } catch (e) {
            return { ...NOT_CHECKED, note: `online OCSP failed: ${e instanceof Error ? e.message : 'error'}` };
        }
    }

    const crlUrl = extractCrlUrl(subjectCert);
    if (crlUrl !== null) {
        try {
            const res = await guardedFetch(crlUrl, { accept: 'application/pkix-crl' });
            if (res.status === 200) {
                const r = checkCrl(res.body, subjectCert, issuerCert);
                if (r.status !== 'unknown') {
                    return { checked: true, status: r.status, source: 'online', method: 'crl', revokedAt: r.revokedAt, note: null };
                }
            }
        } catch (e) {
            return { ...NOT_CHECKED, note: `online CRL failed: ${e instanceof Error ? e.message : 'error'}` };
        }
    }

    return { ...NOT_CHECKED, note: 'no OCSP/CRL responder available' };
}

// ── Minimal DER encoder for the OCSP request ──────────────────────────

function derLength(len: number): number[] {
    if (len < 0x80) return [len];
    const bytes: number[] = [];
    let n = len;
    while (n > 0) {
        bytes.unshift(n & 0xff);
        n >>= 8;
    }
    return [0x80 | bytes.length, ...bytes];
}

function der(tag: number, content: readonly number[]): number[] {
    return [tag, ...derLength(content.length), ...content];
}

function encodeOidBytes(oid: string): number[] {
    const parts = oid.split('.').map((p) => Number.parseInt(p, 10));
    const out: number[] = [40 * (parts[0] as number) + (parts[1] as number)];
    for (let i = 2; i < parts.length; i++) {
        let v = parts[i] as number;
        const stack: number[] = [v & 0x7f];
        v >>= 7;
        while (v > 0) {
            stack.unshift((v & 0x7f) | 0x80);
            v >>= 7;
        }
        out.push(...stack);
    }
    return out;
}

function bigIntToBytes(v: bigint): number[] {
    if (v === 0n) return [0];
    const bytes: number[] = [];
    let n = v;
    while (n > 0n) {
        bytes.unshift(Number(n & 0xffn));
        n >>= 8n;
    }
    if ((bytes[0] as number) & 0x80) bytes.unshift(0); // keep positive
    return bytes;
}

/** Build a minimal RFC 6960 OCSPRequest containing a single CertID. */
export function buildOcspRequest(
    subjectCert: X509Certificate,
    issuerCert: X509Certificate,
): Uint8Array {
    // SHA-1 is the RFC 6960 §B.1 DEFAULT CertID hash algorithm and the only one
    // reliably indexed by deployed OCSP responders. The hash is a non-security
    // *identifier* over the issuer's PUBLIC subject DN and public key — NOT an
    // integrity or signature primitive (OCSP trust derives from the responder
    // signature, which we verify separately). NIST SP 800-131A explicitly
    // permits SHA-1 for such non-signature uses. Using SHA-256 here would make
    // most responders answer "unknown". This is a reviewed CodeQL false positive
    // (js/weak-cryptographic-algorithm). See SECURITY.md § "Cryptographic
    // algorithm usage".
    // codeql[js/weak-cryptographic-algorithm]
    const nameHash = Array.from(createHash('sha1').update(issuerCert.subject.raw).digest());
    // codeql[js/weak-cryptographic-algorithm]
    const keyHash = Array.from(createHash('sha1').update(issuerCert.publicKeyBytes).digest());
    const serial = bigIntToBytes(subjectCert.serialNumber);

    const hashAlg = der(0x30, [...der(0x06, encodeOidBytes(OID_SHA1)), ...der(0x05, [])]); // sha1 + NULL
    const certId = der(0x30, [
        ...hashAlg,
        ...der(0x04, nameHash),
        ...der(0x04, keyHash),
        ...der(0x02, serial),
    ]);
    const request = der(0x30, [...certId]); // Request ::= SEQUENCE { reqCert CertID }
    const requestList = der(0x30, [...request]); // SEQUENCE OF Request
    const tbsRequest = der(0x30, [...requestList]); // TBSRequest
    const ocspRequest = der(0x30, [...tbsRequest]); // OCSPRequest
    return new Uint8Array(ocspRequest);
}
