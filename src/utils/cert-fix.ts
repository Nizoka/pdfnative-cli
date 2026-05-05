/**
 * Workaround for a pdfnative ≤ 1.1.0 bug where `parseCertificate(...)` returns
 * `cert.issuer.raw` and `cert.subject.raw` with off-by-N byte slices that do
 * not start with the expected `0x30` SEQUENCE tag. The CMS produced by
 * `signPdfBytes(...)` then carries an unparseable `issuerAndSerialNumber`
 * (no validator — Adobe, openssl, our own — accepts the resulting signature).
 *
 * We re-walk `tbsCertificateBytes` to recover the correct DN slices and
 * return a shallow-cloned `X509Certificate` whose `issuer.raw` and
 * `subject.raw` are properly bounded.
 *
 * Tracking issue: https://github.com/Nizoka/pdfnative/issues (filed for v0.3.0).
 *
 * @internal — exposed for tests; CLI consumers use `loadCertificate` (which
 * applies this fix transparently).
 */

import { derDecode } from '../core-bridge/index.js';
import type { X509Certificate, Asn1Node } from '../core-bridge/index.js';
import { CliError } from './error.js';

const TAG_SEQUENCE = 0x30;
const TAG_CONTEXT_0 = 0xa0;

/**
 * Recover the correct issuer / subject DN bytes from
 * `cert.tbsCertificateBytes` and return a corrected certificate.
 */
export function correctCertificateIssuerRaw(cert: X509Certificate): X509Certificate {
    const issuerOk = cert.issuer.raw.length >= 1 && cert.issuer.raw[0] === TAG_SEQUENCE;
    const subjectOk = cert.subject.raw.length >= 1 && cert.subject.raw[0] === TAG_SEQUENCE;
    if (issuerOk && subjectOk) return cert;

    let tbs: Asn1Node;
    try {
        tbs = derDecode(cert.tbsCertificateBytes);
    } catch {
        throw new CliError('Cannot recover DN slices from certificate (TBS unparsable).', 1);
    }
    if (tbs.tag !== TAG_SEQUENCE) {
        throw new CliError('Cannot recover DN slices from certificate (TBS is not a SEQUENCE).', 1);
    }

    // TBSCertificate (RFC 5280 §4.1):
    //   [0] EXPLICIT version (optional, default v1)
    //   serialNumber INTEGER
    //   signature AlgorithmIdentifier (SEQUENCE)
    //   issuer Name (SEQUENCE)
    //   validity SEQUENCE
    //   subject Name (SEQUENCE)
    //   subjectPublicKeyInfo SEQUENCE
    //   ...
    // → indices depend on whether [0] EXPLICIT version is present.
    const children = tbs.children;
    const hasVersion = children.length > 0 && (children[0] as Asn1Node).tag === TAG_CONTEXT_0;
    const issuerIdx = hasVersion ? 3 : 2;
    const subjectIdx = hasVersion ? 5 : 4;

    const issuer = children[issuerIdx];
    const subject = children[subjectIdx];
    if (issuer === undefined || issuer.tag !== TAG_SEQUENCE
        || subject === undefined || subject.tag !== TAG_SEQUENCE) {
        throw new CliError('Cannot recover DN slices from certificate (issuer/subject not SEQUENCEs).', 1);
    }

    const tbsBytes = cert.tbsCertificateBytes;
    const issuerRaw = issuerOk
        ? cert.issuer.raw
        : tbsBytes.slice(issuer.offset, issuer.offset + issuer.totalLength);
    const subjectRaw = subjectOk
        ? cert.subject.raw
        : tbsBytes.slice(subject.offset, subject.offset + subject.totalLength);

    return {
        ...cert,
        issuer: { ...cert.issuer, raw: issuerRaw },
        subject: { ...cert.subject, raw: subjectRaw },
    };
}
