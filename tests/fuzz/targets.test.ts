import { readFileSync, readdirSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as surface from '#fuzz-surface';
import { FUZZ_TARGETS, fuzzSeeds, type FuzzTarget } from './_fuzz-seeds.js';

/**
 * The ClusterFuzzLite targets, run here on a seeded corpus (v1.6.0).
 *
 * The container is the only place Jazzer's coverage guidance exists, so a
 * target committed without a local proof is a claim rather than a check.
 * What this suite establishes is the half that can be established anywhere:
 * the modules load, the exported `fuzz` is callable, it survives every
 * truncation and mutation the seeded corpus produces, and — the part that
 * matters — it **rethrows** an engine error (`TypeError`, `RangeError`, …).
 * A target that swallowed every exception would run for a week in the
 * container and find nothing, and no coverage report would say so.
 *
 * The targets resolve `#fuzz-surface` by the package's own `imports` map;
 * vitest's alias points it at `fuzz/surface.ts`, the container's at the
 * tsup bundle with the engine inside. Same file, two engines. The seeds are
 * the ones the container zips (`tests/fuzz/_fuzz-seeds.ts`), so a seed that
 * stopped parsing fails here before it starts a fuzzer outside the grammar.
 */

type Target = { readonly fuzz: (data: Uint8Array) => void };

/** The targets: every `.js` of fuzz/ but the shared `_contract.js`. */
const TARGETS = readdirSync('fuzz').filter((f) => f.endsWith('.js') && !f.startsWith('_')).sort();

/** A small deterministic generator (xorshift32), so a failure reproduces without a seed flag. */
function prng(seed: number): { int: (n: number) => number } {
    let s = seed >>> 0 || 1;
    return {
        int(n: number): number {
            s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
            return s % n;
        },
    };
}

const text = (s: string): Uint8Array => new TextEncoder().encode(s);
const decode = (b: Uint8Array): string => new TextDecoder().decode(b);

/** Bytes that are none of the grammars: shared by every target. */
function sharedCorpus(): Uint8Array[] {
    return [
        new Uint8Array(0),
        text('{'), text('[]'), text('{}'), text('null'), text('{"__proto__":{"polluted":1}}'),
        text('--__proto__\nx'), text('1-'), text('D:'), text('https://'), text('C:'),
        Uint8Array.of(0x00, 0x01, 0x00, 0x00, 0x00, 0x00),
        Uint8Array.of(0xFF, 0xFE, 0xC0, 0x80),
    ];
}

/** What each target's seeds must be: input its parser reads without refusing. */
const READS: Readonly<Record<FuzzTarget, (seed: Uint8Array) => unknown>> = {
    annotations: (s) => surface.parseAnnotationsJson(decode(s)),
    argv: (s) => {
        const argv = decode(s).split('\n');
        surface.parseArgs(argv, { booleanFlags: surface.GLOBAL_BOOLEAN_FLAGS });
        if (surface.splitCommandArgv(argv, surface.KNOWN_COMMANDS).commandName === undefined) throw new Error('an argv seed names no command');
    },
    config: (s) => surface.parseConfigText(decode(s), 'render', 'seed'),
    'font-file': (s) => (surface.sniffFontFormat(s) === null ? surface.parseFontFileSpec(decode(s)) : surface.parseFontData(s)),
    layout: (s) => surface.mergeNestedLayout({}, surface.reviveLayoutJson(JSON.parse(decode(s)) as Record<string, unknown>)),
    manifest: (s) => surface.parseManifest(decode(s), '/fuzz'),
    pages: (s) => surface.parsePageList(decode(s.subarray(1)), (s[0] as number) + 1),
    pdfdate: (s) => {
        const raw = decode(s);
        const accepted = surface.pdfDateToIso(raw) !== raw
            || (() => { try { surface.parseIsoDate(raw, 'creation-date'); return true; } catch { return false; } })()
            || (() => { try { surface.parseSourceDateEpoch(raw); return true; } catch { return false; } })();
        if (!accepted) throw new Error('no date grammar accepts the seed');
    },
    url: (s) => surface.parseFetchUrl(decode(s)),
};

let SEEDS: Readonly<Record<FuzzTarget, readonly Uint8Array[]>>;
beforeAll(async () => { SEEDS = await fuzzSeeds(); });

const nameOf = (file: string): FuzzTarget => file.replace(/\.js$/, '') as FuzzTarget;

/** The input handed to a planted surface: one that reaches a surface call (the layout target returns before any call on non-JSON). */
const PLANTED_INPUT: Partial<Record<FuzzTarget, Uint8Array>> = { layout: text('{}') };

describe('fuzz targets', () => {
    it('should be the set the container builds and seeds', () => {
        // build.sh names each target; a file added here and not there is a
        // target that never runs, which is worse than no target at all.
        expect(TARGETS).toEqual(FUZZ_TARGETS.map((t) => `${t}.js`));
        const build = readFileSync('.clusterfuzzlite/build.sh', 'utf8');
        for (const target of TARGETS) {
            expect(build, `build.sh does not compile ${target}`).toContain(`compile_javascript_fuzzer pdfnative-cli fuzz/${target} --sync`);
        }
        expect(build, 'build.sh does not loop over every target when zipping seeds').toContain(`for target in ${FUZZ_TARGETS.join(' ')}; do`);
        expect(build).toContain('npx tsx tests/fuzz/_fuzz-seeds.ts');
        expect(build).toContain('npm run build');
    });

    it('should pin the engine to one version and every package of its tree to an integrity hash', () => {
        // An unpinned `npm install @jazzer.js/core` resolves whatever the
        // registry serves on the day of the build — a supply-chain input the
        // project's own lockfile discipline exists to refuse.
        const manifest = JSON.parse(readFileSync('.clusterfuzzlite/engine/package.json', 'utf8')) as { name: string; dependencies: Record<string, string> };
        expect(manifest.name).toBe('pdfnative-cli-fuzz-engine');
        expect(Object.keys(manifest.dependencies)).toEqual(['@jazzer.js/core']);
        const version = manifest.dependencies['@jazzer.js/core'] ?? '';
        expect(version, 'an exact version, not a range').toMatch(/^\d+\.\d+\.\d+$/);

        const lock = JSON.parse(readFileSync('.clusterfuzzlite/engine/package-lock.json', 'utf8')) as {
            name: string;
            lockfileVersion: number;
            packages: Record<string, { name?: string; version?: string; integrity?: string; resolved?: string }>;
        };
        expect(lock.lockfileVersion).toBe(3);
        expect(lock.name).toBe(manifest.name);
        expect(lock.packages['']?.name).toBe(manifest.name);
        expect(lock.packages['node_modules/@jazzer.js/core']?.version).toBe(version);
        const installed = Object.entries(lock.packages).filter(([path]) => path !== '');
        expect(installed.length).toBeGreaterThan(1);
        for (const [path, entry] of installed) {
            expect(entry.integrity, `${path} has no sha512 integrity`).toMatch(/^sha512-[A-Za-z0-9+/]+=*$/);
            expect(entry.resolved, `${path} resolves outside the npm registry`).toMatch(/^https:\/\/registry\.npmjs\.org\//);
        }

        const build = readFileSync('.clusterfuzzlite/build.sh', 'utf8');
        const commands = build.split('\n').filter((line) => !line.trimStart().startsWith('#'));
        expect(commands.filter((line) => /\bnpm (install|i|add)\b/.test(line)), 'build.sh installs outside a lockfile').toEqual([]);
        expect(commands.join('\n')).toContain('(cd .clusterfuzzlite/engine && npm ci --ignore-scripts)');
        expect(readFileSync('.clusterfuzzlite/engine/.npmrc', 'utf8')).toContain('ignore-scripts=true');
    });

    it('should keep the engine out of the package: pdfnative the only runtime dependency, fuzz/ not published, the surface private', () => {
        const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies?: Record<string, string>; files?: string[]; imports?: Record<string, string> };
        expect(Object.keys(pkg.dependencies ?? {})).toEqual(['pdfnative']);
        expect(pkg.files ?? [], 'package.json "files" must whitelist, and never fuzz/ or .clusterfuzzlite/').not.toEqual([]);
        for (const entry of pkg.files ?? []) expect(entry).not.toMatch(/fuzz|clusterfuzzlite/);
        // A `#` specifier resolves inside the package only: no consumer can import it.
        expect(pkg.imports?.['#fuzz-surface']).toBe('./fuzz/.build/fuzz-surface.js');
        expect(readFileSync('.gitignore', 'utf8')).toMatch(/^fuzz\/\.build\/$/m);
    });

    it.each(FUZZ_TARGETS)('the %s seeds should be read by the target\'s parser, so the fuzzer starts inside the grammar', (target) => {
        expect(SEEDS[target].length).toBeGreaterThan(0);
        for (const seed of SEEDS[target]) expect(() => READS[target](seed)).not.toThrow();
    });

    it.each(TARGETS)('%s should survive the seeded corpus, truncated and mutated', async (file) => {
        const { fuzz } = await import(/* @vite-ignore */ `../../fuzz/${file}`) as Target;
        expect(typeof fuzz, `${file} exports no fuzz function`).toBe('function');

        const rand = prng(0x5EED_1006);
        for (const seed of SEEDS[nameOf(file)]) fuzz(seed);
        for (const seed of [...sharedCorpus(), ...SEEDS[nameOf(file)].slice(0, 3)]) {
            // Up to 64 cuts per seed: every byte of a short seed, a stride on a long one.
            const stride = Math.max(1, Math.ceil(seed.length / 64));
            for (let cut = 0; cut < seed.length; cut += stride) fuzz(seed.subarray(0, cut));
            for (let i = 0; i < 64; i++) {
                const mutated = Uint8Array.from(seed);
                if (mutated.length > 0) mutated[rand.int(mutated.length)] = rand.int(256);
                fuzz(mutated);
            }
        }
        for (let i = 0; i < 256; i++) {
            fuzz(Uint8Array.from({ length: rand.int(48) }, () => rand.int(256)));
        }
    }, 120_000);

    it.each(TARGETS)('%s should rethrow an engine error, or it finds nothing', async (file) => {
        // The one assertion that keeps a target honest, and it cannot be made
        // with real input: the parsers are supposed never to throw an engine
        // error, so the only way to prove the target would surface one is to
        // make the surface misbehave on purpose. A target whose catch had
        // been widened to `catch {}` would fuzz for a week, crash on nothing
        // and report success — and no coverage number would say so.
        //
        // Every lower-case function export is planted, not a list of names:
        // a target that starts calling a new parser is covered without an
        // edit here. The two error classes keep their identity, so the
        // target's own `instanceof` refusal check still runs.
        vi.resetModules();
        vi.doMock('#fuzz-surface', async () => {
            const actual = await vi.importActual<Record<string, unknown>>('#fuzz-surface');
            const boom = (): never => { throw new TypeError('planted: an engine error'); };
            return Object.fromEntries(Object.entries(actual).map(([name, value]) =>
                [name, typeof value === 'function' && /^[a-z]/.test(name) ? boom : value]));
        });
        try {
            const { fuzz } = await import(/* @vite-ignore */ `../../fuzz/${file}`) as Target;
            expect(() => { fuzz(PLANTED_INPUT[nameOf(file)] ?? Uint8Array.of(0x25, 0x50, 0x44, 0x46)); }).toThrow('planted: an engine error');
        } finally {
            vi.doUnmock('#fuzz-surface');
            vi.resetModules();
        }
    });
});
