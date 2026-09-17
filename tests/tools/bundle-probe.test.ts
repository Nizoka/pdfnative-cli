// scripts/lib/bundle-probe.ts — the gate step `bundle-check` (v1.5.0).

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { probeBundle, externalRequires, ENGINE_MARKERS, REQUIRED_EXTERNALS } from '../../scripts/lib/bundle-probe.js';

const ROOT = resolve(import.meta.dirname, '..', '..');
const CLI = join(ROOT, 'dist', 'cli.cjs');

/** The shape tsup emits: shebang banner, built-ins, the two engine externals, relative code. */
const GOOD = [
    '#!/usr/bin/env node',
    '"use strict";',
    'var fs = require("node:fs"); var path = require("path");',
    'var engine = require("pdfnative"); var tools = require("pdfnative/tools"); var pkg = require("pdfnative/package.json");',
    'var local = require("./x.js");',
    'const PEM_RE = /-----BEGIN [^-]+-----[\\s\\S]*?-----END [^-]+-----/g;',
    'process.stdout.write("artifact");',
].join('\n');

describe('probeBundle', () => {
    it('accepts a well-formed bundle (and the PEM regex source in keys.ts does not trip the PEM check)', () => {
        expect(probeBundle(GOOD)).toEqual([]);
    });

    it('lists the externals without the relative ones', () => {
        expect(externalRequires(GOOD)).toEqual(['node:fs', 'path', 'pdfnative', 'pdfnative/package.json', 'pdfnative/tools']);
    });

    it.each(ENGINE_MARKERS)('flags the engine marker %j', (marker) => {
        expect(probeBundle(`${GOOD}\nvar x = "${marker}";`)).toEqual([expect.stringContaining('engine marker')]);
    });

    it.each([
        ['a missing shebang', GOOD.replace('#!/usr/bin/env node', '"use strict";'), 'first line is not the node shebang'],
        ['a second shebang', `${GOOD}\n#!/usr/bin/env node`, 'second shebang'],
        ['a base64 run', `${GOOD}\nvar b = "${'A'.repeat(2048)}";`, 'base64 run'],
        ['a font data module', `${GOOD}\nrequire("./fonts/noto-sans-data.js");`, 'noto-*-data.js'],
        ['an attribution trailer', `${GOOD}\n// Co-Authored-By: someone`, 'Co-Authored-By'],
        ['a real PEM block', `${GOOD}\nvar k = "-----BEGIN PRIVATE KEY-----\\n${'MIIE'.repeat(32)}\\n-----END PRIVATE KEY-----";`, 'PEM block'],
        ['a console.log', `${GOOD}\nconsole.log("debug");`, 'console.log('],
        ['an undeclared external', `${GOOD}\nrequire("left-pad");`, 'left-pad'],
    ])('flags %s', (_label, code, message) => {
        expect(probeBundle(code)).toEqual([expect.stringContaining(message)]);
    });

    it.each(REQUIRED_EXTERNALS)('flags a bundle that no longer requires %s', (spec) => {
        const code = GOOD.replace(`require("${spec}")`, '({})');
        expect(probeBundle(code)).toEqual([expect.stringContaining(`require("${spec}") is missing`)]);
    });
});

describe.runIf(existsSync(CLI))('the built bundle', () => {
    it('passes the probe', () => {
        expect(probeBundle(readFileSync(CLI, 'utf8'))).toEqual([]);
    });
});
