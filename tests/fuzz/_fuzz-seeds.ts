/**
 * Seeds for the ClusterFuzzLite targets in `fuzz/`, one list per target.
 *
 * A coverage-guided fuzzer started from random bytes spends its first hours
 * rediscovering `{ "version": 1`, `--input` and `D:2026`; started from an
 * input that parses, it is inside the grammar on its first mutation. Every
 * seed here comes from the repository's own samples (the batch manifests,
 * the annotation specs, the config sample, the `layout` objects of the
 * render samples) or is assembled from the grammar's documentation — never
 * committed as an opaque blob. The one binary seed, a TrueType face, is the
 * engine's bundled Noto Hebrew, read from the installed font module.
 *
 * Two consumers, one list:
 *   - `tests/fuzz/targets.test.ts` feeds every seed, truncated and mutated,
 *     to its target on every gate run, after proving each seed parses;
 *   - `.clusterfuzzlite/build.sh` runs this file as a script
 *     (`npx tsx tests/fuzz/_fuzz-seeds.ts <dir>`), which writes
 *     `<dir>/<target>/<n>.bin` for the build step to zip into each target's
 *     seed corpus.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveFontsDir } from '../../src/utils/fonts.js';

/** The target names, as `fuzz/<name>.js`, in the order `readdirSync` lists them. */
export type FuzzTarget = 'annotations' | 'argv' | 'config' | 'font-file' | 'layout' | 'manifest' | 'pages' | 'pdfdate' | 'url';

export const FUZZ_TARGETS: readonly FuzzTarget[] = ['annotations', 'argv', 'config', 'font-file', 'layout', 'manifest', 'pages', 'pdfdate', 'url'];

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const text = (s: string): Uint8Array => new TextEncoder().encode(s);
const file = (...parts: string[]): Uint8Array => new Uint8Array(readFileSync(join(ROOT, ...parts)));
const json = (value: unknown): Uint8Array => text(JSON.stringify(value, null, 2));

/** Every `*.json` of a directory, as bytes. */
function jsonFiles(...dir: string[]): Uint8Array[] {
    return readdirSync(join(ROOT, ...dir)).filter((f) => f.endsWith('.json')).sort().map((f) => file(...dir, f));
}

/** The `layout` objects the render samples carry (print recipes, typography, output intents). */
function sampleLayouts(): Uint8Array[] {
    const out: Uint8Array[] = [];
    const walk = (dir: string): void => {
        for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
            if (entry.isDirectory()) walk(`${dir}/${entry.name}`);
            else if (entry.name.endsWith('.json')) {
                const doc = JSON.parse(readFileSync(join(ROOT, dir, entry.name), 'utf8')) as { layout?: unknown };
                if (doc.layout !== undefined && typeof doc.layout === 'object') out.push(json(doc.layout));
            }
        }
    };
    walk('samples/render');
    return out;
}

/** The engine's bundled Noto Hebrew face, decoded from its font module (the CLI never ships a TTF of its own). */
async function bundledTrueType(): Promise<Uint8Array> {
    const mod = await import(pathToFileURL(join(resolveFontsDir(), 'noto-hebrew-data.js')).href) as { default?: { ttfBase64: string }; ttfBase64?: string };
    const b64 = (mod.default ?? mod).ttfBase64;
    if (typeof b64 !== 'string') throw new Error('noto-hebrew-data.js exports no ttfBase64');
    return new Uint8Array(Buffer.from(b64, 'base64'));
}

/** A page-selector seed: the first byte is the page count, the rest the selector. */
const pages = (count: number, spec: string): Uint8Array => Uint8Array.from([count - 1, ...text(spec)]);

export async function fuzzSeeds(): Promise<Readonly<Record<FuzzTarget, readonly Uint8Array[]>>> {
    const ttf = await bundledTrueType();
    return {
        annotations: [
            ...jsonFiles('samples', 'annotate'),
            json([{ page: 1, type: 'highlight', rect: [72, 700, 300, 716], quadPoints: [72, 716, 300, 716, 72, 700, 300, 700], color: '#ffff00', opacity: 0.5, contents: 'seed' }]),
            json({ annotations: [{ page: 2, type: 'line', rect: [0, 0, 100, 100], start: [0, 0], end: [100, 100], borderWidth: 2 }, { page: 1, type: 'text', rect: [10, 10, 30, 30], open: true, icon: 'Note' }] }),
        ],
        argv: [
            text(['render', '--input', 'doc.json', '--output', 'doc.pdf', '--tagged', 'pdfa2b', '--pdfx', 'pdfx4', '--font', 'ar', '--font', 'he', '--direction', 'auto', '--json'].join('\n')),
            text(['--json', '--dry-run', 'sign', '-i', 'in.pdf', '-o', 'out.pdf', '--key', 'k.pem', '--cert', 'c.pem', '--cert-chain=a.pem', '--cert-chain=b.pem', '--profile', 'pades'].join('\n')),
            text(['merge', 'a.pdf', 'b.pdf', '--', '--not-a-flag', '-o', 'm.pdf'].join('\n')),
            text(['--config', '.pdfnativerc.json', 'extract-text', '--input', 'render', '--format', 'ndjson', '--on-stream-error', 'skip'].join('\n')),
        ],
        config: [
            file('samples', 'config', '.pdfnativerc.json'),
            json({ 'no-color': true, render: { 'page-size': 'a4', compress: false, font: ['ar', 'he'], 'max-blocks': 500 }, verify: { revocation: 'offline' }, batch: { concurrency: 2 } }),
        ],
        'font-file': [
            ttf,
            text('C:\\fonts\\My Font.ttf:my-font'),
            text('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'),
        ],
        layout: [
            ...sampleLayouts(),
            json({ pageSize: 'letter', margins: { top: 40, bottom: 40, left: 36, right: 36 }, direction: 'rtl', actualText: false, typography: { kerning: true, features: ['liga', 'kern'] }, outputIntent: { identifier: 'FOGRA39', iccProfile: [0, 0, 1, 0] }, creationDate: '2026-01-01T00:00:00Z', attachments: [{ name: 'invoice.xml', data: [60, 63] }] }),
        ],
        manifest: [
            file('samples', 'batch', 'manifest', 'tasks.json'),
            json({ version: 1, tasks: [{ id: 'a', command: 'render', flags: { input: 'a.json', output: 'out/a.pdf', 'font-file': 'fonts/a.ttf', 'output-intent-icc': 'p.icc' } }, { id: 'b', command: 'inspect', flags: { input: '@a', summary: true } }] }),
        ],
        pages: [pages(10, '1,3,5-7'), pages(3, '1-3'), pages(64, ' 64 , 1 '), pages(1, '1')],
        pdfdate: [
            text("D:20260101120000+02'00'"), text('D:20261231235960Z'), text('D:2026'),
            text('2026-01-01T00:00:00Z'), text('2026-10-31T12:34:56.789+01:00'), text('1767225600'),
        ],
        url: [
            text('https://ocsp.example.com/'), text('http://crl.example.org:8080/ca.crl?x=1#f'),
            text('https://[2001:db8::1]/ocsp'), text('http://203.0.113.9/'), text('https://user:pw@tsa.example.net/tsr'),
        ],
    };
}

// `npx tsx tests/fuzz/_fuzz-seeds.ts <dir>` — write the corpora for build.sh to zip.
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const dir = process.argv[2];
    if (dir === undefined) {
        process.stderr.write('usage: npx tsx tests/fuzz/_fuzz-seeds.ts <dir>\n');
        process.exit(2);
    }
    const seeds = await fuzzSeeds();
    for (const target of FUZZ_TARGETS) {
        mkdirSync(join(dir, target), { recursive: true });
        seeds[target].forEach((seed, i) => writeFileSync(join(dir, target, `${i}.bin`), seed));
    }
    process.stdout.write(`${FUZZ_TARGETS.length} corpora written under ${dir}\n`);
}
