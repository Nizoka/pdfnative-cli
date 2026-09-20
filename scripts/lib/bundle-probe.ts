// What the built bundle (dist/cli.cjs) must and must not contain — the gate
// step `bundle-check` (v1.5.0, audit G5, ported in spirit from pdfnative's
// verify-bundle.ts). The byte budget (`bundle-size`) would catch the engine
// being inlined whole; this catches it being inlined in part, a font data
// module dragged in, a stray secret, a debug print or a dependency the
// package.json does not declare. Pure functions over the bundle text, so
// tests can feed synthetic bundles.

import { isBuiltin } from 'node:module';

/** The only modules the bundle may `require` from outside itself, besides Node built-ins. */
export const ALLOWED_EXTERNALS: ReadonlySet<string> = new Set(['pdfnative', 'pdfnative/tools', 'pdfnative/package.json']);

/** Externals the bundle MUST require: the engine stays external, never inlined. */
export const REQUIRED_EXTERNALS: readonly string[] = ['pdfnative', 'pdfnative/tools'];

/**
 * Byte strings that only exist inside the engine (or its font data): an AES
 * S-box row, the first SHA-256 round constant, the base64 head of a TrueType
 * table directory and a subset font tag. Any of them in the bundle means
 * engine code was inlined.
 */
export const ENGINE_MARKERS: readonly string[] = ['AAEAAAAR', '99,124,119,123', '1116352408', '\'HVM\''];

const REQUIRE_RE = /require\((['"])([^'"]+)\1\)/g;
const BASE64_RUN = /[A-Za-z0-9+/]{2048,}/;
const FONT_DATA_REQUIRE = /require\((['"])[^'"]*noto-[^'"]*-data\.js\1\)/;
// A real PEM block: header, then at least 64 base64 / whitespace characters (or the `\n`
// escapes a string literal carries), then a footer. The regex SOURCE in src/utils/keys.ts
// (`[\s\S]*?`) contains characters outside that class, so it never matches.
const PEM_BLOCK = /-----BEGIN [A-Z ]+-----(?:[A-Za-z0-9+/=\s]|\\[nr]){64,}-----END [A-Z ]+-----/;

/** Every module specifier the bundle requires that is not a relative path. */
export function externalRequires(code: string): string[] {
    const out = new Set<string>();
    for (const m of code.matchAll(REQUIRE_RE)) {
        const spec = m[2] as string;
        if (spec.startsWith('.') || spec.startsWith('/')) continue;
        out.add(spec);
    }
    return [...out].sort();
}

/** The failure lines for `code`; empty when the bundle is what it should be. */
export function probeBundle(code: string): readonly string[] {
    const failures: string[] = [];
    const lines = code.split('\n');
    if (!(lines[0] ?? '').startsWith('#!/usr/bin/env node')) failures.push('the first line is not the node shebang');
    lines.forEach((line, i) => {
        if (i > 0 && line.startsWith('#!')) failures.push(`line ${i + 1} is a second shebang`);
    });
    for (const marker of ENGINE_MARKERS) {
        if (code.includes(marker)) failures.push(`engine marker ${JSON.stringify(marker)} found — engine code is inlined`);
    }
    if (BASE64_RUN.test(code)) failures.push('a base64 run of 2048+ characters found — embedded binary data');
    if (FONT_DATA_REQUIRE.test(code)) failures.push('a noto-*-data.js font module is required — font data must stay in the engine package');
    if (code.includes('Co-Authored-By')) failures.push('"Co-Authored-By" found — attribution trailers never ship');
    if (PEM_BLOCK.test(code)) failures.push('a PEM block found — key material or a certificate is embedded');
    if (code.includes('console.log(')) failures.push('console.log( found — stdout is reserved for the artifact');
    const externals = externalRequires(code);
    for (const spec of externals) {
        if (!ALLOWED_EXTERNALS.has(spec) && !isBuiltin(spec)) failures.push(`external require("${spec}") is not a Node built-in and not on the allow list`);
    }
    for (const required of REQUIRED_EXTERNALS) {
        if (!externals.includes(required)) failures.push(`require("${required}") is missing — the engine must stay external`);
    }
    return failures;
}
