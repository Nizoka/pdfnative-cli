import { describe, it, expect } from 'vitest';
import {
    isSemver,
    isIsoDate,
    todayUtc,
    stripTag,
    minorLine,
    bumpJsonVersion,
    bumpLockVersion,
    engineVersion,
    bumpManifest,
    restampVerifiedOn,
    bumpCitation,
    bumpSecurityTable,
    bumpReadmeBanner,
    replaceProductVersion,
    bumpKnowledgeBaseFooter,
    bumpCurrentVersion,
    scaffoldReleaseNote,
    parseArgs,
} from '../../scripts/release-prepare.js';

// v1.5.0 — the pure half of scripts/release-prepare.ts: every edit is a
// targeted regex on the one field it owns, and these fixtures pin exactly
// which text each one may and may not touch. No git, no filesystem.

describe('release-prepare: helpers', () => {
    it('accepts plain semver triples only', () => {
        expect(isSemver('1.5.0')).toBe(true);
        expect(isSemver('v1.5.0')).toBe(false);
        expect(isSemver('1.5')).toBe(false);
        expect(isSemver('1.5.0-rc.1')).toBe(false);
    });

    it('validates ISO dates and formats today in UTC', () => {
        expect(isIsoDate('2026-09-16')).toBe(true);
        expect(isIsoDate('16/09/2026')).toBe(false);
        expect(isIsoDate('2026-13-45')).toBe(false);
        expect(todayUtc(new Date(Date.UTC(2026, 8, 16, 23, 59)))).toBe('2026-09-16');
    });

    it('strips the tag prefix and derives the minor line', () => {
        expect(stripTag('v1.4.0')).toBe('1.4.0');
        expect(stripTag('1.4.0')).toBe('1.4.0');
        expect(minorLine('1.5.3')).toBe('1.5');
        expect(minorLine('2.0.0')).toBe('2.0');
    });
});

describe('release-prepare: package manifests', () => {
    const PKG = '{\n  "name": "pdfnative-cli",\n  "version": "1.4.0",\n  "dependencies": {\n    "pdfnative": "^1.8.0"\n  },\n  "devDependencies": {\n    "tsx": {\n      "version": "4.0.0"\n    }\n  }\n}\n';

    it('bumps the top-level version and nothing nested', () => {
        const r = bumpJsonVersion(PKG, '1.5.0');
        expect(r.matched).toBe(1);
        expect(r.text).toContain('  "version": "1.5.0",');
        expect(r.text).toContain('      "version": "4.0.0"');
        expect(r.text).not.toContain('1.4.0');
    });

    it('reports matched=1 with unchanged text when already at the version', () => {
        const r = bumpJsonVersion(PKG.replace('1.4.0', '1.5.0'), '1.5.0');
        expect(r.matched).toBe(1);
        expect(r.text).toBe(PKG.replace('1.4.0', '1.5.0'));
    });

    it('reports matched=0 when there is no top-level version', () => {
        expect(bumpJsonVersion('{\n  "name": "x"\n}\n', '1.5.0').matched).toBe(0);
    });

    it('bumps the lockfile root and packages[""] but no dependency', () => {
        const LOCK =
            '{\n  "name": "pdfnative-cli",\n  "version": "1.4.0",\n  "lockfileVersion": 3,\n  "packages": {\n    "": {\n      "name": "pdfnative-cli",\n      "version": "1.4.0",\n      "bin": {\n        "x": "y"\n      }\n    },\n    "node_modules/a": {\n      "version": "1.4.0"\n    }\n  }\n}\n';
        const r = bumpLockVersion(LOCK, '1.5.0');
        expect(r.matched).toBe(2);
        expect(r.text.match(/"version": "1\.5\.0"/g)).toHaveLength(2);
        expect(r.text).toContain('"node_modules/a": {\n      "version": "1.4.0"');
    });

    it('reads the pdfnative dependency floor as the engine version', () => {
        expect(engineVersion(PKG)).toBe('1.8.0');
        expect(engineVersion(PKG.replace('^1.8.0', '~1.8.2'))).toBe('1.8.2');
        expect(engineVersion('{ "devDependencies": { "pdfnative": "^1.8.0" } }')).toBeNull();
    });
});

describe('release-prepare: ecosystem manifest and stamps', () => {
    const MANIFEST =
        '{\n  "$comment": "x",\n  "verifiedOn": "2026-08-26",\n  "packages": {\n    "pdfnative-cli": {\n      "version": "1.4.0",\n      "pin": null\n    },\n    "pdfnative": {\n      "version": "1.8.0"\n    }\n  }\n}\n';

    it('bumps only the pdfnative-cli package version and the verifiedOn date', () => {
        const r = bumpManifest(MANIFEST, '1.5.0', '2026-09-16');
        expect(r.matched).toBe(2);
        expect(r.text).toContain('"verifiedOn": "2026-09-16"');
        expect(r.text).toContain('"pdfnative-cli": {\n      "version": "1.5.0"');
        expect(r.text).toContain('"pdfnative": {\n      "version": "1.8.0"');
    });

    it('re-stamps the prose and JSON forms of the verified-on marker', () => {
        const prose = restampVerifiedOn('_Verified on 2026-08-26 against the source tree._', '2026-09-16');
        expect(prose.matched).toBe(1);
        expect(prose.text).toBe('_Verified on 2026-09-16 against the source tree._');
        const json = restampVerifiedOn('{\n  "verifiedOn": "2026-08-26",\n  "x": 1\n}', '2026-09-16');
        expect(json.text).toContain('"verifiedOn": "2026-09-16"');
        expect(restampVerifiedOn('no stamp here', '2026-09-16').matched).toBe(0);
    });
});

describe('release-prepare: CITATION.cff', () => {
    const CFF = 'cff-version: 1.2.0\ntitle: "pdfnative-cli"\nlicense: MIT\nversion: 1.4.0\nkeywords:\n  - pdf\n';

    it('bumps version, never cff-version, and adds date-released when absent', () => {
        const r = bumpCitation(CFF, '1.5.0', '2026-09-16');
        expect(r.matched).toBe(2);
        expect(r.text).toContain('cff-version: 1.2.0\n');
        expect(r.text).toContain('license: MIT\nversion: 1.5.0\ndate-released: 2026-09-16\nkeywords:');
    });

    it('rewrites an existing date-released in place, keeping its quoting style', () => {
        const quoted = bumpCitation(CFF.replace('version: 1.4.0\n', 'version: 1.4.0\ndate-released: "2026-08-26"\n'), '1.5.0', '2026-09-16');
        expect(quoted.matched).toBe(2);
        expect(quoted.text).toContain('version: 1.5.0\ndate-released: "2026-09-16"\n');
        expect(quoted.text.match(/date-released/g)).toHaveLength(1);
        const bare = bumpCitation(CFF.replace('version: 1.4.0\n', 'version: 1.4.0\ndate-released: 2026-08-26\n'), '1.5.0', '2026-09-16');
        expect(bare.text).toContain('date-released: 2026-09-16\n');
    });

    it('reports matched=0 on a file without a version key', () => {
        expect(bumpCitation('cff-version: 1.2.0\ntitle: x\n', '1.5.0', '2026-09-16').matched).toBe(0);
    });
});

describe('release-prepare: SECURITY.md table', () => {
    const TABLE =
        '## Supported Versions\n\n| Version | Supported |\n|---------|-----------|\n| 1.4.x   | ✅        |\n| 1.3.x   | ✅ (security fixes) |\n| < 1.3   | ❌        |\n\n## Security Model\n';

    it('promotes the new minor and demotes the supported line to security fixes', () => {
        const r = bumpSecurityTable(TABLE, '1.5.0');
        expect(r.matched).toBe(1);
        expect(r.text).toContain('| 1.5.x   | ✅        |\n| 1.4.x   | ✅ (security fixes) |\n| < 1.4   | ❌        |');
        expect(r.text).not.toContain('1.3');
    });

    it('leaves the table alone on a patch release', () => {
        const r = bumpSecurityTable(TABLE, '1.4.4');
        expect(r.matched).toBe(1);
        expect(r.text).toBe(TABLE);
    });

    it('follows the same rule on a major bump', () => {
        const r = bumpSecurityTable(TABLE, '2.0.0');
        expect(r.text).toContain('| 2.0.x   | ✅        |\n| 1.4.x   | ✅ (security fixes) |\n| < 1.4   | ❌        |');
    });

    it('reports matched=0 when the table shape is unrecognised', () => {
        expect(bumpSecurityTable('| 1.4 | yes |\n', '1.5.0').matched).toBe(0);
    });
});

describe('release-prepare: README banner, knowledge-base footer and llms.txt', () => {
    const README = [
        '# pdfnative-cli',
        '',
        "> **What's new in v1.4.0** — built on **pdfnative 1.7.0**. Four new commands.",
        '> See [release notes](release-notes/v1.4.0.md) and [AGENTS.md](AGENTS.md).',
        '',
        'Historical: v1.3.0 added `extract-text`; see [release notes](release-notes/v1.3.0.md).',
    ].join('\n');

    it('bumps the three banner tokens and nothing below the banner', () => {
        const r = bumpReadmeBanner(README, '1.5.0', '1.8.0');
        expect(r.matched).toBe(3);
        expect(r.text).toContain("**What's new in v1.5.0** — built on **pdfnative 1.8.0**");
        expect(r.text).toContain('[release notes](release-notes/v1.5.0.md)');
        expect(r.text).toContain('[release notes](release-notes/v1.3.0.md)');
        expect(bumpReadmeBanner(README, '1.5.0', null).matched).toBe(2);
        expect(bumpReadmeBanner('# nothing', '1.5.0', '1.8.0').matched).toBe(0);
    });

    it('rewrites the word-bounded prose form of one product only', () => {
        const text = 'pdfnative-cli v1.4.0 and pdfnative-cli 1.4.0 but pdfnative 1.4.0 and pdfnative-cli v1.4.01';
        const r = replaceProductVersion(text, 'pdfnative-cli', '1.4.0', '1.5.0');
        expect(r.matched).toBe(2);
        expect(r.text).toBe('pdfnative-cli v1.5.0 and pdfnative-cli 1.5.0 but pdfnative 1.4.0 and pdfnative-cli v1.4.01');
    });

    it('moves the date, CLI version and engine of the knowledge-base footer together', () => {
        const kb = '# KB\n\nbody\n\n---\n\n*Verified on 2026-08-26 · pdfnative-cli v1.4.0 · pdfnative 1.7.0*\n';
        const r = bumpKnowledgeBaseFooter(kb, '1.5.0', '1.8.0', '2026-09-16');
        expect(r.matched).toBe(1);
        expect(r.text).toContain('*Verified on 2026-09-16 · pdfnative-cli v1.5.0 · pdfnative 1.8.0*');
        expect(bumpKnowledgeBaseFooter(kb, '1.5.0', null, '2026-09-16').text).toContain('· pdfnative 1.7.0*');
        expect(bumpKnowledgeBaseFooter('*Last updated: 2026-08-26 | pdfnative-cli v1.4.0*', '1.5.0', '1.8.0', '2026-09-16').matched).toBe(0);
    });

    it('bumps the Current version line of llms.txt', () => {
        const r = bumpCurrentVersion('# pdfnative-cli\n\nCurrent version: 1.4.0 (built on pdfnative 1.7.0)\n', '1.5.0');
        expect(r.matched).toBe(1);
        expect(r.text).toContain('Current version: 1.5.0 (built on pdfnative 1.7.0)');
        expect(bumpCurrentVersion('no line', '1.5.0').matched).toBe(0);
    });
});

describe('release-prepare: release note scaffold', () => {
    const TEMPLATE = [
        '# Release Notes Template',
        '',
        '```markdown',
        '# pdfnative-cli vX.Y.Z',
        '',
        '_Released YYYY-MM-DD_',
        '',
        '## Install',
        '',
        '\\`\\`\\`bash',
        'npm install -g pdfnative-cli@X.Y.Z',
        '\\`\\`\\`',
        '',
        'Drop-in replacement for vX.Y.Z-1.',
        '- [Full diff](https://github.com/Nizoka/pdfnative-cli/compare/vX.Y.Z-1...vX.Y.Z)',
        '```',
        '',
        '## Conventions',
    ].join('\n');

    it('extracts the fenced block, resolves the placeholders and unescapes the fences', () => {
        const note = scaffoldReleaseNote(TEMPLATE, '1.5.0', '2026-09-16', 'v1.4.0');
        expect(note).toBe(
            [
                '# pdfnative-cli v1.5.0',
                '',
                '_Released 2026-09-16_',
                '',
                '## Install',
                '',
                '```bash',
                'npm install -g pdfnative-cli@1.5.0',
                '```',
                '',
                'Drop-in replacement for v1.4.0.',
                '- [Full diff](https://github.com/Nizoka/pdfnative-cli/compare/v1.4.0...v1.5.0)',
                '',
            ].join('\n'),
        );
    });

    it('refuses a template without a markdown block', () => {
        expect(() => scaffoldReleaseNote('# nothing here', '1.5.0', '2026-09-16', 'v1.4.0')).toThrow(/markdown block/);
    });
});

describe('release-prepare: argument parsing', () => {
    it('requires --version and validates it', () => {
        expect(parseArgs([])).toMatch(/--version is required/);
        expect(parseArgs(['--version', '1.5'])).toMatch(/not a plain semver/);
        expect(parseArgs(['--version', 'v1.5.0'])).toMatch(/not a plain semver/);
    });

    it('defaults the date to today (UTC) and the previous tag to git', () => {
        const opts = parseArgs(['--version', '1.5.0']);
        expect(opts).toMatchObject({ version: '1.5.0', previous: null, dryRun: false });
        expect(typeof opts === 'string' ? '' : opts.date).toBe(todayUtc());
    });

    it('accepts explicit date, previous (with or without v) and --dry-run in either form', () => {
        expect(parseArgs(['--version=1.5.0', '--date=2026-09-16', '--previous=1.4.0', '--dry-run'])).toEqual({
            version: '1.5.0',
            date: '2026-09-16',
            previous: 'v1.4.0',
            dryRun: true,
        });
        expect(parseArgs(['--version', '1.5.0', '--previous', 'v1.4.0'])).toMatchObject({ previous: 'v1.4.0' });
    });

    it('rejects bad dates, bad tags and unknown flags', () => {
        expect(parseArgs(['--version', '1.5.0', '--date', '16/09/2026'])).toMatch(/not an ISO date/);
        expect(parseArgs(['--version', '1.5.0', '--previous', 'latest'])).toMatch(/not a tag/);
        expect(parseArgs(['--version', '1.5.0', '--force'])).toMatch(/unknown argument "--force"/);
    });
});
