/**
 * Samples derived from rendered ones through the other write commands:
 * page-tree operations, annotations, form filling, metadata, encryption
 * and signatures. Every invocation is deterministic (pinned instants, the
 * committed test key pair, RFC 6979 ECDSA via --pure-crypto) except the
 * encrypted outputs, which the fingerprint lib hashes semantically.
 *
 * Nothing here touches the network: sign --timestamp, doc-timestamp, ltv
 * --online and verify --revocation online are out of the corpus by design.
 */

import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT, SAMPLE_CREATION_ISO, type GenerateContext } from '../helpers/io.js';
import { runCli } from '../helpers/cli.js';
import { PASSWORDS } from '../lib/sample-plan.js';

const FIXTURES = join(REPO_ROOT, 'tests', 'fixtures');
const SAMPLES = join(REPO_ROOT, 'samples');

interface Step {
    /** Output path relative to test-output/samples/. */
    readonly out: string;
    readonly args: (out: string) => readonly string[];
    readonly env?: Readonly<Record<string, string>>;
    /** Which category the `--category` filter selects this step under. */
    readonly category: string;
}

function signingEnv(kind: 'rsa' | 'ec'): Readonly<Record<string, string>> {
    return {
        PDFNATIVE_SIGN_KEY: readFileSync(join(FIXTURES, `${kind}-key.pem`), 'utf8'),
        PDFNATIVE_SIGN_CERT: readFileSync(join(FIXTURES, `${kind}-cert.pem`), 'utf8'),
    };
}

/** The document samples every derived step starts from (rendered by generators/render.ts). */
const MINIMAL = 'document/01-minimal.pdf';
const REPORT = 'document/02-report.pdf';

const STEPS: readonly Step[] = [
    // ── page tree ──────────────────────────────────────────────────────
    { category: 'page-tree', out: 'page-tree/merged.pdf', args: (o) => ['merge', MINIMAL, REPORT, '--output', o] },
    { category: 'page-tree', out: 'page-tree/merged-stream.pdf', args: (o) => ['merge', MINIMAL, REPORT, '--output', o, '--stream'] },
    { category: 'page-tree', out: 'page-tree/merged-encrypted.pdf', args: (o) => ['merge', MINIMAL, REPORT, '--output', o, '--encrypt', 'aes-256', '--owner-password', PASSWORDS.mergedOwner] },
    { category: 'page-tree', out: 'page-tree/extract-p1.pdf', args: (o) => ['extract', '--input', REPORT, '--pages', '1', '--output', o] },
    // split writes <prefix>-<n>.pdf into --output-dir; the first part is recorded.
    { category: 'page-tree', out: 'page-tree/split-1.pdf', args: () => ['split', '--input', REPORT, '--output-dir', 'page-tree', '--prefix', 'split'] },
    // ── annotate ───────────────────────────────────────────────────────
    { category: 'annotate', out: 'annotate/annotated.pdf', args: (o) => ['annotate', '--input', REPORT, '--output', o, '--annotations', join(SAMPLES, 'annotate', '01-annotations.json')] },
    { category: 'annotate', out: 'annotate/linked.pdf', args: (o) => ['annotate', '--input', REPORT, '--output', o, '--annotations', join(SAMPLES, 'annotate', '02-links.json')] },
    // ── fill ───────────────────────────────────────────────────────────
    { category: 'fill', out: 'fill/form.pdf', args: (o) => ['render', '--input', join(SAMPLES, 'fill', 'form.json'), '--output', o, '--creation-date', SAMPLE_CREATION_ISO] },
    { category: 'fill', out: 'fill/filled.pdf', args: (o) => ['fill', '--input', 'fill/form.pdf', '--data', join(SAMPLES, 'fill', 'form-values.json'), '--output', o] },
    { category: 'fill', out: 'fill/flattened.pdf', args: (o) => ['fill', '--input', 'fill/form.pdf', '--data', join(SAMPLES, 'fill', 'form-values.json'), '--flatten', '--output', o] },
    // ── metadata ───────────────────────────────────────────────────────
    { category: 'metadata', out: 'metadata/updated.pdf', args: (o) => ['metadata', '--input', MINIMAL, '--output', o, '--title', 'Updated title', '--author', 'pdfnative-cli samples', '--mod-date', SAMPLE_CREATION_ISO] },
    // ── encrypt / decrypt ──────────────────────────────────────────────
    { category: 'encrypt', out: 'encrypt/document-aes128.pdf', args: (o) => ['encrypt', '--input', MINIMAL, '--output', o, '--algorithm', 'aes-128', '--owner-password', PASSWORDS.owner, '--user-password', PASSWORDS.user, '--permissions', 'print'] },
    { category: 'encrypt', out: 'encrypt/document-aes256.pdf', args: (o) => ['encrypt', '--input', MINIMAL, '--output', o, '--algorithm', 'aes-256', '--owner-password', PASSWORDS.owner] },
    { category: 'encrypt', out: 'encrypt/decrypted.pdf', args: (o) => ['decrypt', '--input', 'encrypt/document-aes128.pdf', '--output', o, '--password', PASSWORDS.owner] },
    // Password rotation on the rendered encryption sample, upgrading the
    // algorithm: the semantic projection (document + algorithm/revision)
    // then differs from both document-aes256.pdf and the source.
    { category: 'encrypt', out: 'encrypt/rotated.pdf', args: (o) => ['encrypt', '--input', 'encryption/01-aes128-protected.pdf', '--output', o, '--password', PASSWORDS.owner, '--algorithm', 'aes-256', '--owner-password', PASSWORDS.rotatedOwner] },
    // ── sign (offline; pinned signing time) ────────────────────────────
    // Fingerprinted semantically (scripts/lib/sample-fingerprint.ts
    // SIGNED_SAMPLES): the incremental revision carries a per-revision /ID
    // the engine derives at signing time, so the bytes never repeat.
    // Each signs a different document so the four projections differ.
    { category: 'sign', out: 'sign/rsa-pkcs7.pdf', env: signingEnv('rsa'), args: (o) => ['sign', '--input', MINIMAL, '--output', o, '--signing-time', SAMPLE_CREATION_ISO, '--reason', 'Sample', '--location', 'Paris'] },
    { category: 'sign', out: 'sign/rsa-pades.pdf', env: signingEnv('rsa'), args: (o) => ['sign', '--input', REPORT, '--output', o, '--profile', 'pades', '--signing-time', SAMPLE_CREATION_ISO] },
    { category: 'sign', out: 'sign/rsa-sha384.pdf', env: signingEnv('rsa'), args: (o) => ['sign', '--input', 'document/04-invoice.pdf', '--output', o, '--digest', 'sha384', '--signing-time', SAMPLE_CREATION_ISO] },
    // ECDSA through pdfnative's pure-JS path: RFC 6979 deterministic nonces.
    { category: 'sign', out: 'sign/ecdsa-pure.pdf', env: signingEnv('ec'), args: (o) => ['sign', '--input', 'document/05-technical-spec.pdf', '--output', o, '--algorithm', 'ecdsa-sha256', '--pure-crypto', '--signing-time', SAMPLE_CREATION_ISO] },
];

export function generate(ctx: GenerateContext, cli: string, category: string | null): void {
    for (const step of STEPS) {
        if (category && category !== step.category) continue;
        const out = join(ctx.outputDir, step.out);
        mkdirSync(join(ctx.outputDir, step.category), { recursive: true });
        // Positional/relative paths resolve against the corpus root.
        const r = runCli(step.args(out), { env: step.env, cwd: ctx.outputDir }, cli);
        if (r.status !== 0) {
            ctx.failed.push(step.out);
            process.stderr.write(`FAIL  ${step.out}\n${r.stderr.trim().split(/\r?\n/).map((l) => `      ${l}`).join('\n')}\n`);
            continue;
        }
        if (!existsSync(out)) {
            ctx.failed.push(step.out);
            process.stderr.write(`FAIL  ${step.out}: the CLI exited 0 but wrote nothing\n`);
            continue;
        }
        ctx.record(out, step.out);
    }
}
