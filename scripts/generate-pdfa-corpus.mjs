/**
 * pdfnative-cli — PDF/A validation corpus generator
 * ==================================================
 * Drives the BUILT CLI (`node dist/cli.cjs …`) — never a globally installed
 * `pdfnative` binary — to produce a small, deterministic corpus of
 * PDF/A-claiming documents under `test-output/pdfa/`, covering the
 * PDF/A-relevant command surface (render + PDF/A samples, attachments,
 * header/footer templates, outline, watermark, sign, metadata). It is a
 * representative sample, not an exhaustive feature matrix.
 * `scripts/validate-pdfa.mjs` then runs every file through the veraPDF
 * reference validator.
 *
 * Usage:  npm run build && npm run corpus:pdfa
 *         node scripts/generate-pdfa-corpus.mjs
 * Exit:   0 when every file was written, 1 at the first CLI invocation that
 *         fails (its stderr is reproduced), 2 when dist/cli.cjs is missing.
 *
 * Dependency-free: node built-ins only, and the CLI is spawned via
 * `process.execPath` (a real .exe / ELF binary — no `.bat` launcher, so no
 * `shell: true` and none of the CVE-2024-27980 quoting concerns apply).
 *
 * Font embedding recipe: the CLI has no `embedFonts` switch — `--font latin`
 * registers the bundled Noto Sans loader and `--lang latin` injects the
 * matching `fontEntries`, which routes ALL Latin text away from non-embedded
 * base-14 Helvetica. Positive entries therefore render with
 * `--strict --font latin --lang latin` (strict mode turns any remaining
 * PDF/A diagnostic into a build failure before the first output byte).
 *
 * Every entry carries `expectCompliant` in manifest.json. Most are `true`; the
 * negative canaries (`false`) are files that claim PDF/A but are KNOWN to be
 * non-conformant — the validator must see veraPDF reject them, otherwise the
 * validator itself is broken ("accepts everything") and the run fails.
 */

import { spawnSync } from 'node:child_process';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'test-output', 'pdfa');
const SPECS_DIR = join(OUT_DIR, '.specs');
const CLI = join(ROOT, 'dist', 'cli.cjs');
const SAMPLES = join(ROOT, 'samples', 'render');

if (!existsSync(CLI)) {
    process.stderr.write('dist/cli.cjs not found — run `npm run build` first.\n');
    process.exit(2);
}

// ── Self-signed RSA test certificate (node:crypto + a tiny DER encoder) ──
// Ported from pdfnative-mcp's corpus generator: a throwaway RSA-2048 key
// signs a v1 certificate with CN=Corpus Signer. Generated per run, encoded
// to PEM in memory only — never written to disk and never printed; the key
// material reaches the CLI exclusively through the child process env
// (PDFNATIVE_SIGN_KEY / PDFNATIVE_SIGN_CERT), so the parent env stays clean.

function derLength(n) {
    if (n < 0x80) return [n];
    const bytes = [];
    for (let v = n; v > 0; v >>>= 8) bytes.unshift(v & 0xff);
    return [0x80 | bytes.length, ...bytes];
}
function der(tag, ...parts) {
    const body = Buffer.concat(parts.map((p) => Buffer.from(p)));
    return Buffer.concat([Buffer.from([tag, ...derLength(body.length)]), body]);
}
const derSeq = (...parts) => der(0x30, ...parts);
const derSet = (...parts) => der(0x31, ...parts);
function derInt(buf) {
    const b = Buffer.from(buf);
    return der(0x02, b[0] & 0x80 ? Buffer.concat([Buffer.from([0]), b]) : b);
}
function derOid(dotted) {
    const p = dotted.split('.').map(Number);
    const out = [p[0] * 40 + p[1]];
    for (const v0 of p.slice(2)) {
        let v = v0;
        const stack = [v & 0x7f];
        for (v >>>= 7; v > 0; v >>>= 7) stack.push((v & 0x7f) | 0x80);
        out.push(...stack.reverse());
    }
    return der(0x06, Buffer.from(out));
}
const derNull = Buffer.from([0x05, 0x00]);
const derBitString = (bytes) => der(0x03, Buffer.from([0]), bytes);
function derUtcTime(date) {
    const s = date.toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z';
    return der(0x17, Buffer.from(s, 'ascii'));
}

/** Wrap DER bytes as a PEM block (64-char base64 lines). */
function toPem(label, derBytes) {
    const b64 = derBytes.toString('base64').replace(/(.{64})/g, '$1\n').trimEnd();
    return `-----BEGIN ${label}-----\n${b64}\n-----END ${label}-----\n`;
}

/** Build a self-signed RSA-2048 cert; returns { keyPem, certPem } (in memory only). */
function buildRsaSelfSignedCert(cn = 'Corpus Signer') {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk = privateKey.export({ format: 'jwk' });
    const rsaPub = derSeq(derInt(Buffer.from(jwk.n, 'base64url')), derInt(Buffer.from(jwk.e, 'base64url')));
    const spki = derSeq(derSeq(derOid('1.2.840.113549.1.1.1'), derNull), derBitString(rsaPub));
    const sigAlg = derSeq(derOid('1.2.840.113549.1.1.11'), derNull);
    const name = derSeq(derSet(derSeq(derOid('2.5.4.3'), der(0x0c, Buffer.from(cn, 'utf8')))));
    const validity = derSeq(derUtcTime(new Date(Date.now() - 60_000)), derUtcTime(new Date(Date.now() + 365 * 86_400_000)));
    const tbs = derSeq(derInt(Buffer.from([1])), sigAlg, name, validity, name, spki);
    const sig = createSign('sha256').update(tbs).sign(privateKey);
    const certDer = derSeq(tbs, sigAlg, derBitString(sig));
    return {
        keyPem: privateKey.export({ format: 'pem', type: 'pkcs8' }),
        certPem: toPem('CERTIFICATE', certDer),
    };
}

// ── CLI invocation ──────────────────────────────────────────────────────

/**
 * Run `node dist/cli.cjs <args>`; on any failure (spawn error or non-zero
 * exit) the CLI's stderr is reproduced and the generator exits 1 — a corpus
 * with a missing or half-rendered file must never reach the validator.
 */
function runCli(label, args, extraEnv) {
    const r = spawnSync(process.execPath, [CLI, ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 64 * 1024 * 1024,
        env: extraEnv ? { ...process.env, ...extraEnv } : process.env,
    });
    if (r.error || r.status !== 0) {
        process.stderr.write(`FAIL  ${label}\n`);
        if (r.error) process.stderr.write(`      spawn failed: ${r.error.message ?? r.error}\n`);
        const err = (r.stderr ?? '').trim();
        if (err) for (const l of err.split(/\r?\n/)) process.stderr.write(`      ${l}\n`);
        process.exit(1);
    }
}

// ── Corpus definition ───────────────────────────────────────────────────

const pdfaSample = (name) => join(SAMPLES, 'pdfa', name);
const out = (file) => join(OUT_DIR, file);

/**
 * The embedding recipe every positive entry uses (see the header comment):
 * strict mode + bundled Latin font registration + fontEntries injection.
 */
const STRICT_FONTS = ['--strict', '--font', 'latin', '--lang', 'latin'];

/**
 * The exact attachment recipe from samples/run-all.js CATEGORY_FLAGS.attachments
 * (absolute payload path, as run-all.js builds it).
 */
const ATTACHMENT_FLAGS = [
    '--tagged', 'pdfa3b',
    '--attachment', `${join(SAMPLES, 'attachments', 'invoice.xml')}:application/xml:Source:Structured invoice payload`,
];

/**
 * Minimal PdfParams fixture for the table-variant negative canary. The table
 * variant requires the full ledger shape (docTitle / infoItems / balanceText /
 * countText / footerText alongside title / headers / rows) — see
 * samples/render/table-variant/01-financial-transactions.json.
 */
const TABLE_SPEC = {
    docTitle: 'Corpus — table variant under PDF/A-1b (negative canary)',
    title: 'Corpus table',
    infoItems: [],
    balanceText: '',
    countText: '',
    headers: ['Item', 'Qty', 'Price'],
    rows: [
        { type: 'data', pointed: false, cells: ['Widget', '2', '9.99'] },
        { type: 'data', pointed: false, cells: ['Gadget', '1', '24.50'] },
    ],
    footerText: 'Generated by scripts/generate-pdfa-corpus.mjs',
};

/**
 * Corpus: `file` is the output name under test-output/pdfa/, `run` performs
 * the CLI invocation(s), `command` is the human-readable manifest record.
 * Later entries may consume earlier outputs (signed-/metadata- reuse the
 * sample-* renders), so the order matters and execution is sequential.
 */
const CORPUS = [
    // ── Positive entries: --strict --font latin --lang latin ─────────────
    {
        file: 'sample-pdfa1b.pdf',
        command: 'render samples/render/pdfa/01-pdfa-1b.json --strict --font latin --lang latin',
        run: (f) => runCli(f, ['render', '--input', pdfaSample('01-pdfa-1b.json'), '--output', out(f), ...STRICT_FONTS]),
    },
    {
        file: 'sample-pdfa2b.pdf',
        command: 'render samples/render/pdfa/02-pdfa-2b.json --strict --font latin --lang latin',
        run: (f) => runCli(f, ['render', '--input', pdfaSample('02-pdfa-2b.json'), '--output', out(f), ...STRICT_FONTS]),
    },
    {
        file: 'sample-pdfa3b.pdf',
        command: 'render samples/render/pdfa/03-pdfa-3b.json --strict --font latin --lang latin',
        run: (f) => runCli(f, ['render', '--input', pdfaSample('03-pdfa-3b.json'), '--output', out(f), ...STRICT_FONTS]),
    },
    {
        file: 'sample-pdfa2u.pdf',
        command: 'render samples/render/pdfa/04-pdfa-2u.json --strict --font latin --lang latin',
        run: (f) => runCli(f, ['render', '--input', pdfaSample('04-pdfa-2u.json'), '--output', out(f), ...STRICT_FONTS]),
    },
    {
        // The exact run-all.js attachments recipe on top of the strict/fonts base:
        // PDF/A-3b with an /AFRelationship Source XML payload (Factur-X pattern).
        file: 'attachment-pdfa3b-xml.pdf',
        command: 'render samples/render/attachments/01-pdfa3-with-xml.json --tagged pdfa3b --attachment invoice.xml:application/xml:Source:Structured invoice payload --strict --font latin --lang latin',
        run: (f) => runCli(f, [
            'render', '--input', join(SAMPLES, 'attachments', '01-pdfa3-with-xml.json'), '--output', out(f),
            ...ATTACHMENT_FLAGS, ...STRICT_FONTS,
        ]),
    },
    {
        file: 'headers-footers-pdfa2b.pdf',
        command: 'render samples/render/pdfa/02-pdfa-2b.json --header-left "{title}" --footer-center "Page {page} of {pages}" --strict --font latin --lang latin',
        run: (f) => runCli(f, [
            'render', '--input', pdfaSample('02-pdfa-2b.json'), '--output', out(f),
            '--header-left', '{title}', '--footer-center', 'Page {page} of {pages}', ...STRICT_FONTS,
        ]),
    },
    {
        file: 'outline-pdfa2b.pdf',
        command: 'render samples/render/pdfa/02-pdfa-2b.json --outline auto --strict --font latin --lang latin',
        run: (f) => runCli(f, [
            'render', '--input', pdfaSample('02-pdfa-2b.json'), '--output', out(f),
            '--outline', 'auto', ...STRICT_FONTS,
        ]),
    },
    {
        // Opacity 1: PDF/A-1 forbids transparency and PDF/A-2 constrains it;
        // a fully opaque watermark keeps the claim safe at every level.
        file: 'watermark-pdfa2b.pdf',
        command: 'render samples/render/pdfa/02-pdfa-2b.json --watermark-text DRAFT --watermark-opacity 1 --strict --font latin --lang latin',
        run: (f) => runCli(f, [
            'render', '--input', pdfaSample('02-pdfa-2b.json'), '--output', out(f),
            '--watermark-text', 'DRAFT', '--watermark-opacity', '1', ...STRICT_FONTS,
        ]),
    },
    {
        // PAdES baseline-B signature over the PDF/A-2b render, via an
        // incremental update (the claim must survive). Credentials travel
        // through the CHILD env only (never disk, never the parent env).
        file: 'signed-pdfa2b.pdf',
        command: 'sign sample-pdfa2b.pdf --profile pades (throwaway self-signed RSA-2048 via env)',
        run: (f) => {
            const { keyPem, certPem } = buildRsaSelfSignedCert();
            runCli(f, ['sign', '--input', out('sample-pdfa2b.pdf'), '--output', out(f), '--profile', 'pades'], {
                PDFNATIVE_SIGN_KEY: keyPem,
                PDFNATIVE_SIGN_CERT: certPem,
            });
        },
    },
    {
        // Incremental /Info + XMP rewrite on a claiming file: the PDF/A-2u
        // claim and metadata synchronisation (ISO 19005 6.6.2) must survive.
        file: 'metadata-pdfa2u.pdf',
        command: 'metadata sample-pdfa2u.pdf --title "Corpus metadata check" --author "pdfnative-cli corpus" --mod-date 2026-08-26T00:00:00Z',
        run: (f) => runCli(f, [
            'metadata', '--input', out('sample-pdfa2u.pdf'),
            '--title', 'Corpus metadata check', '--author', 'pdfnative-cli corpus',
            '--mod-date', '2026-08-26T00:00:00Z', '-o', out(f),
        ]),
    },

    // ── Negative canaries: rendered WITHOUT --strict and WITHOUT fonts ───
    {
        // The PDF/A sample as-is: base-14 Helvetica is referenced, not
        // embedded, so the file claims PDF/A-2b but violates
        // ISO 19005-2 §6.2.11.4.1 (all fonts used for rendering shall be
        // embedded). veraPDF MUST reject it.
        file: 'nofonts-pdfa2b.pdf',
        expectCompliant: false,
        command: 'render samples/render/pdfa/02-pdfa-2b.json (no --strict, no fonts — ISO 19005-2 6.2.11.4.1 canary)',
        run: (f) => runCli(f, ['render', '--input', pdfaSample('02-pdfa-2b.json'), '--output', out(f)]),
    },
    {
        // Table variant under PDF/A-1b: `--variant table` (PdfParams) has no
        // fontEntries channel, so the CLI CANNOT embed fonts on this path —
        // Helvetica stays non-embedded and the claim violates
        // ISO 19005-1 §6.3.4 (font programs shall be embedded). veraPDF MUST
        // reject it. The spec fixture lives under .specs/ (not a .pdf, so the
        // pruning pass never touches it) and stays out of the manifest.
        file: 'table-pdfa1b-nofonts.pdf',
        expectCompliant: false,
        command: 'render .specs/table.json --variant table --tagged pdfa1b (no fonts possible — ISO 19005-1 6.3.4 canary)',
        run: (f) => {
            const spec = join(SPECS_DIR, 'table.json');
            mkdirSync(SPECS_DIR, { recursive: true });
            writeFileSync(spec, `${JSON.stringify(TABLE_SPEC, null, 2)}\n`);
            runCli(f, ['render', '--input', spec, '--output', out(f), '--variant', 'table', '--tagged', 'pdfa1b']);
        },
    },
];

// ── Main ────────────────────────────────────────────────────────────────

function main() {
    mkdirSync(OUT_DIR, { recursive: true });
    // Prune PDFs left over from an older corpus layout so the validator's
    // "unlisted file" note only ever points at something unexpected. Only
    // top-level *.pdf files are pruned — manifest.json, .specs/ and reports/
    // are never touched.
    const current = new Set(CORPUS.map((e) => e.file));
    for (const stale of readdirSync(OUT_DIR).filter((f) => f.endsWith('.pdf') && !current.has(f))) {
        rmSync(join(OUT_DIR, stale));
        process.stdout.write(`  pruned ${stale}\n`);
    }

    const manifest = [];
    let totalBytes = 0;

    for (const entry of CORPUS) {
        entry.run(entry.file); // exits 1 on the first failing CLI invocation
        const dest = out(entry.file);
        if (!existsSync(dest)) {
            process.stderr.write(`FAIL  ${entry.file}\n      CLI exited 0 but wrote no file at ${relative(ROOT, dest)}.\n`);
            return 1;
        }
        const bytes = statSync(dest).size;
        // Sanity: written bytes must at least start like a PDF.
        if (!readFileSync(dest).subarray(0, 5).equals(Buffer.from('%PDF-', 'ascii'))) {
            process.stderr.write(`FAIL  ${entry.file}\n      output does not start with %PDF-.\n`);
            return 1;
        }
        totalBytes += bytes;
        const expectPdfAClaim = entry.expectPdfAClaim !== false;
        // A file that makes no claim is never validated, so it has no compliance expectation.
        const expectCompliant = expectPdfAClaim && entry.expectCompliant !== false;
        manifest.push({ file: entry.file, command: entry.command, bytes, expectPdfAClaim, expectCompliant });
        const note = !expectPdfAClaim ? ', no PDF/A claim expected' : !expectCompliant ? ', NEGATIVE canary — must fail veraPDF' : '';
        process.stdout.write(`  wrote  ${entry.file.padEnd(32)} ${String(bytes).padStart(8)} B${note ? `  (${note.slice(2)})` : ''}\n`);
    }

    const negatives = manifest.filter((m) => m.expectPdfAClaim && !m.expectCompliant).length;
    writeFileSync(join(OUT_DIR, 'manifest.json'), `${JSON.stringify({ generatedBy: 'scripts/generate-pdfa-corpus.mjs', files: manifest }, null, 2)}\n`);
    process.stdout.write(
        `\nPDF/A corpus: ${manifest.length} file(s), ${totalBytes} bytes, ${negatives} negative canar${negatives === 1 ? 'y' : 'ies'} → test-output/pdfa/ (manifest.json written)\n`,
    );
    return 0;
}

process.exit(main());
