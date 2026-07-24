import { describe, it, expect } from 'vitest';
import { cliVersion } from '../../src/utils/version.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string };

describe('cliVersion', () => {
    it('resolves the package version (matches package.json)', () => {
        expect(cliVersion()).toBe(pkg.version);
    });

    it('returns a semver-shaped string', () => {
        expect(cliVersion()).toMatch(/^\d+\.\d+\.\d+/);
    });

    it('is stable across calls (cached)', () => {
        expect(cliVersion()).toBe(cliVersion());
    });
});
