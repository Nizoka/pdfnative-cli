// scripts/lib/markdown-anchors.ts — the GitHub heading slug and the anchor
// inventory the verify-docs rule `anchor-parity` relies on (v1.5.0).

import { describe, it, expect } from 'vitest';
import { githubSlug, markdownAnchors, fragmentLinks } from '../../scripts/lib/markdown-anchors.js';

describe('githubSlug', () => {
    it.each([
        ['12. Frequently Asked Questions', '12-frequently-asked-questions'],
        ['PDF/A validation (veraPDF)', 'pdfa-validation-verapdf'],
        ['`pdfnative render`', 'pdfnative-render'],
        ['Mission and constraints', 'mission-and-constraints'],
        ['🚀 Quick Start', '-quick-start'],
        ['Flag & ZWJ', 'flag--zwj'],
        ['Where is what ##', 'where-is-what'],
        ['[Ecosystem](https://example.com) links', 'ecosystem-links'],
        ['<code>schema</code> manifest', 'schema-manifest'],
        ['A &amp; B &lt;C&gt;', 'a--b-c'],
        // A tag that re-forms once the inner one is removed leaves no bracket behind.
        ['Nested <<b>script>alert</script> tags', 'nested-scriptalert-tags'],
        ['a < b and c > d', 'a--b-and-c--d'],
        ['snake_case_keeps_underscores', 'snake_case_keeps_underscores'],
        ['  padded  ', 'padded'],
        ['Über Größe', 'über-größe'],
        ['v1.5.0 — typography, 27 scripts', 'v150--typography-27-scripts'],
    ])('%j → %j', (heading, slug) => {
        expect(githubSlug(heading)).toBe(slug);
    });
});

describe('markdownAnchors', () => {
    it('collects ATX headings of every level and suffixes duplicates like GitHub', () => {
        const md = '# Title\n## Section\n### Section\n#### Deep ####\n## Section\n';
        expect([...markdownAnchors(md)]).toEqual(['title', 'section', 'section-1', 'deep', 'section-2']);
    });

    it('collects setext headings but not table separators, thematic breaks or list underlines', () => {
        const md = [
            'Setext one', '==========', '', 'Setext two', '----------', '',
            '| a | b |', '|---|---|', '| 1 | 2 |', '',
            '---', '', '- item', '---', '', '# Real',
        ].join('\n');
        expect([...markdownAnchors(md)]).toEqual(['setext-one', 'setext-two', 'real']);
    });

    it('skips headings inside fenced code blocks (``` and ~~~) and HTML comments', () => {
        const md = [
            '# Kept', '```bash', '# not a heading', '```', '~~~', '## nor this', '~~~',
            '<!--', '## commented out', '-->', '## Also kept <!-- ## inline comment -->', '````md', '```', '# still fenced', '````', '# Last',
        ].join('\n');
        expect([...markdownAnchors(md)]).toEqual(['kept', 'also-kept', 'last']);
    });

    it('adds explicit id and name attributes', () => {
        const md = '<a id="Custom-Anchor"></a>\n<h2 name="named">x</h2>\n# H\n';
        const anchors = markdownAnchors(md);
        expect(anchors.has('custom-anchor')).toBe(true);
        expect(anchors.has('named')).toBe(true);
        expect(anchors.has('h')).toBe(true);
    });

    it('handles CRLF documents', () => {
        expect([...markdownAnchors('# A\r\n## B\r\n')]).toEqual(['a', 'b']);
    });
});

describe('fragmentLinks', () => {
    it('finds same-document and cross-document fragments and ignores external URLs', () => {
        const md = 'See [x](#one), [y](docs/KB.md#two), [z](https://example.com/#three), [w](../a.md#Four) and [plain](README.md).';
        expect(fragmentLinks(md).map((l) => [l.path, l.fragment])).toEqual([['', 'one'], ['docs/KB.md', 'two'], ['../a.md', 'Four']]);
    });

    it('reports the offset of each link (its closing bracket) so the rule can name the line', () => {
        const md = 'line1\n[a](#x)\n';
        expect(fragmentLinks(md)[0]?.index).toBe(8);
    });
});
