// `pdfnative doctor` — environment / capability preflight.
//
// A zero-dependency, offline self-check for humans (onboarding) and agents
// (pre-flight before attempting an operation — notably `encrypt`, which needs a
// Web Crypto CSPRNG). Reports the CLI version, Node version, Web Crypto
// availability, the resolved `pdfnative` version, the registered command
// count and — since v1.5.0 — the bundled font inventory (31 modules / 27
// scripts, each file probed on disk), the Universal Shaping Engine's Unicode
// version and the conformance targets (`--tagged` / `--pdfx`).
// Text by default; `--json` emits `{ ok, checks: [{ name, status, value, detail }] }`.
// Exit code 0 when all checks pass, 1 otherwise.
//
// Note: pdfnative's font registry is empty in a fresh process (the CLI only
// registers a font on `--font`), so `getRegisteredLangs()` would always print
// `[]` here; the allow-list plus an on-disk probe is the meaningful preflight.

import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ParsedArgs } from '../utils/args.js';
import { hasFlag } from '../utils/args.js';
import { isJsonMode } from '../utils/agent.js';
import { serializeJson } from '../utils/projection.js';
import { cliVersion } from '../utils/version.js';
import { COMMANDS } from './completion.js';
import { BUNDLED_FONT_MODULES, SCRIPT_CODES, FONT_ALIASES, resolveFontsDir } from '../utils/fonts.js';
import { PDF_A_CONFORMANCE_TARGETS, PDF_X_CONFORMANCE_TARGETS, USE_UNICODE_VERSION } from '../core-bridge/index.js';

type CheckStatus = 'ok' | 'warn' | 'error';

interface Check {
    readonly name: string;
    readonly status: CheckStatus;
    readonly value: string;
    readonly detail: string;
}

const MIN_NODE_MAJOR = 22;

function nodeCheck(): Check {
    const raw = process.versions.node;
    const major = Number.parseInt(raw.split('.')[0] ?? '0', 10);
    const ok = Number.isInteger(major) && major >= MIN_NODE_MAJOR;
    return {
        name: 'node',
        status: ok ? 'ok' : 'error',
        value: `v${raw}`,
        detail: `>= ${MIN_NODE_MAJOR} required`,
    };
}

function webCryptoCheck(): Check {
    const g = globalThis as { crypto?: { getRandomValues?: unknown; subtle?: unknown } };
    const available = typeof g.crypto?.getRandomValues === 'function';
    return {
        name: 'webcrypto',
        status: available ? 'ok' : 'error',
        value: available ? 'available' : 'missing',
        detail: 'CSPRNG required by `encrypt` / re-encryption',
    };
}

function pdfnativeCheck(): Check {
    try {
        const require = createRequire(import.meta.url);
        const pkg = require('pdfnative/package.json') as { version?: string };
        const version = typeof pkg.version === 'string' ? pkg.version : 'unknown';
        return { name: 'pdfnative', status: 'ok', value: version, detail: 'engine (sole runtime dependency)' };
    } catch {
        return { name: 'pdfnative', status: 'error', value: 'not found', detail: 'engine (sole runtime dependency)' };
    }
}

/** Every bundled font module must resolve on disk: a partial install breaks `--font`. */
function fontsCheck(): Check {
    const modules = Object.keys(BUNDLED_FONT_MODULES).length;
    const scripts = SCRIPT_CODES.length;
    let dir: string;
    try {
        dir = resolveFontsDir();
    } catch {
        return { name: 'fonts', status: 'error', value: `${modules} modules / ${scripts} scripts`, detail: 'pdfnative fonts/ directory not resolvable' };
    }
    const missing = Object.entries(BUNDLED_FONT_MODULES)
        .filter(([, file]) => !existsSync(join(dir, file)))
        .map(([code]) => code);
    const aliases = Object.keys(FONT_ALIASES).join(', ');
    if (missing.length > 0) {
        return {
            name: 'fonts',
            status: 'error',
            value: `${modules} modules / ${scripts} scripts`,
            detail: `missing bundled module(s): ${missing.join(', ')}`,
        };
    }
    return {
        name: 'fonts',
        status: 'ok',
        value: `${modules} modules / ${scripts} scripts`,
        detail: `--font shortcuts: ${SCRIPT_CODES.join(', ')} (+ latin, emoji, color-emoji, math; aliases ${aliases} → latin)`,
    };
}

function unicodeCheck(): Check {
    return {
        name: 'unicode',
        status: 'ok',
        value: USE_UNICODE_VERSION,
        detail: 'Unicode Character Database of the Universal Shaping Engine',
    };
}

function conformanceCheck(): Check {
    return {
        name: 'conformance',
        status: 'ok',
        value: [...PDF_A_CONFORMANCE_TARGETS, ...PDF_X_CONFORMANCE_TARGETS].join(','),
        detail: '--tagged (PDF/A) and --pdfx (PDF/X) targets',
    };
}

function buildChecks(): Check[] {
    return [
        { name: 'cli', status: 'ok', value: cliVersion(), detail: 'pdfnative-cli version' },
        nodeCheck(),
        webCryptoCheck(),
        pdfnativeCheck(),
        { name: 'commands', status: 'ok', value: String(COMMANDS.length), detail: 'registered commands' },
        fontsCheck(),
        unicodeCheck(),
        conformanceCheck(),
    ];
}

export async function doctor(args: ParsedArgs): Promise<void> {
    const checks = buildChecks();
    const ok = checks.every((c) => c.status !== 'error');

    const format = getFormat(args);
    const jsonOut = format === 'json' || isJsonMode() || hasFlag(args.flags, 'json');

    if (jsonOut) {
        const pretty = hasFlag(args.flags, 'pretty') || !isJsonMode();
        const payload = {
            ok,
            checks: checks.map((c) => ({ name: c.name, status: c.status, value: c.value, detail: c.detail })),
        };
        process.stdout.write(serializeJson(payload, pretty) + '\n');
    } else {
        const lines = ['pdfnative-cli doctor', ''];
        for (const c of checks) {
            const mark = c.status === 'ok' ? 'ok  ' : c.status === 'warn' ? 'warn' : 'FAIL';
            lines.push(`  ${c.name.padEnd(12)}${c.value.padEnd(32)}${mark}  (${c.detail})`);
        }
        lines.push('', ok ? 'All checks passed.' : 'One or more checks FAILED.');
        process.stdout.write(lines.join('\n') + '\n');
    }

    if (!ok) process.exitCode = 1;
    return Promise.resolve();
}

/** Read `--format json|text` (default text) for doctor. */
function getFormat(args: ParsedArgs): string {
    const v = args.flags['format'] ?? args.flags['f'];
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) return v[0] ?? 'text';
    return 'text';
}
