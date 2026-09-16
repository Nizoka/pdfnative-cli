import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
    NON_COMMAND_SAMPLE_DIRS,
    baselineEntryCount,
    commandNames,
    completionFlags,
    computeDerived,
    defaultMessageKeys,
    errorCodeKeys,
    errorCodeValues,
    errorTokens,
    flagDrift,
    globalFlags,
    manifestCommands,
    readmeCommandHeadings,
    sampleDirs,
    schemaSubjects,
    switchCaseCounts,
    unpairedSampleScripts,
    usageCommandList,
    usageConstantCommand,
    usageFlagsByCommand,
} from '../../scripts/lib/cli-surface.js';

// v1.5.0 — the command surface as verify-docs derives it. The parsers are
// checked on inline fixtures; the derived counts and the parity checks then
// run against the real tree, so this file IS the drift guard between
// src/index.ts, src/commands/completion.ts, README.md and the manifest.

const ROOT = resolve(import.meta.dirname, '..', '..');
const INDEX = readFileSync(join(ROOT, 'src', 'index.ts'), 'utf8');

const USAGE_FIXTURE = `
const USAGE = \`\\
pdfnative-cli — x

Commands (3):

 Create
  render      Render a JSON document definition to PDF
  fill        Fill / flatten / export an AcroForm PDF

 Meta
  doc-timestamp  PAdES B-LTA: append a document timestamp
    not-a-command  (indented deeper: a continuation line)

Options:
  --help,    -h   Show this help message
\`;

const RENDER_USAGE = \`\\
Usage: pdfnative render --input <file> [--pdfx pdfx4] [--font-file <ttf>[:name]]
  --strict           see also sign --timestamp for TSA
\`;
const DOC_TIMESTAMP_USAGE = \`\\
  --url <tsa>  --timeout <ms>
\`;
`;

describe('cli-surface — src/index.ts parsers', () => {
    it('lists the commands under "Commands (N):" and the N it claims', () => {
        expect(usageCommandList(USAGE_FIXTURE)).toEqual({ declared: 3, commands: ['render', 'fill', 'doc-timestamp'] });
        expect(usageCommandList('no usage here')).toEqual({ declared: null, commands: [] });
    });

    it('maps a usage constant to its command name', () => {
        expect(usageConstantCommand('RENDER_USAGE')).toBe('render');
        expect(usageConstantCommand('DOC_TIMESTAMP_USAGE')).toBe('doc-timestamp');
        expect(usageConstantCommand('EXTRACT_TEXT_USAGE')).toBe('extract-text');
    });

    it('collects the --flags of every <NAME>_USAGE template, not of the top-level USAGE', () => {
        const flags = usageFlagsByCommand(USAGE_FIXTURE);
        expect([...flags.keys()]).toEqual(['render', 'doc-timestamp']);
        expect([...flags.get('render')!].sort()).toEqual(['--font-file', '--input', '--pdfx', '--strict', '--timestamp']);
        expect([...flags.get('doc-timestamp')!].sort()).toEqual(['--timeout', '--url']);
    });

    it('counts switch cases per command', () => {
        const counts = switchCaseCounts("switch (x) {\n    case 'render': {\n    case 'sign':\n}\n  case 'render': {");
        expect(counts.get('render')).toBe(2);
        expect(counts.get('sign')).toBe(1);
    });
});

describe('cli-surface — Markdown parsers', () => {
    it('reads the README command reference headings', () => {
        const md = '### `pdfnative render`\n\n### Global options\n\n### `pdfnative extract-text`\n#### `pdfnative nope`\n';
        expect(readmeCommandHeadings(md)).toEqual(['render', 'extract-text']);
    });

    it('extracts word-bounded E_* tokens, never the tail of an env var', () => {
        expect(errorTokens('PDFNATIVE_SIGN_CERT then E_INPUT, `E_USAGE` and E_INPUT again; SE_X no')).toEqual(['E_INPUT', 'E_USAGE']);
    });

    it('reads the DEFAULT_MESSAGE keys of agent.ts', () => {
        const agent = "const DEFAULT_MESSAGE: Readonly<Record<ErrorCodeValue, string>> = {\n    [ErrorCode.USAGE]: 'usage error',\n    [ErrorCode.INPUT]: 'invalid input',\n};\n";
        expect(defaultMessageKeys(agent)).toEqual(['USAGE', 'INPUT']);
        expect(defaultMessageKeys('nothing')).toEqual([]);
    });
});

describe('cli-surface — the real tree', () => {
    it('USAGE lists exactly the completion table, with the count it claims', () => {
        const usage = usageCommandList(INDEX);
        expect(usage.declared).toBe(commandNames().length);
        expect([...usage.commands].sort()).toEqual([...commandNames()].sort());
    });

    it('every command has exactly two switch cases (--help and loadCommand), and no stray case exists', () => {
        const counts = switchCaseCounts(INDEX);
        for (const c of commandNames()) expect(counts.get(c), c).toBe(2);
        for (const c of counts.keys()) expect(commandNames(), c).toContain(c);
    });

    it('every flag a usage text documents is in the completion table, and vice versa', () => {
        expect(flagDrift(INDEX)).toEqual([]);
    });

    it('README documents every command and nothing else', () => {
        const headings = readmeCommandHeadings(readFileSync(join(ROOT, 'README.md'), 'utf8'));
        expect([...headings].sort()).toEqual([...commandNames()].sort());
    });

    it('agent.ts DEFAULT_MESSAGE covers exactly the ErrorCode table', () => {
        const keys = defaultMessageKeys(readFileSync(join(ROOT, 'src', 'utils', 'agent.ts'), 'utf8'));
        expect([...keys].sort()).toEqual([...errorCodeKeys()].sort());
        expect(errorCodeValues()).toHaveLength(errorCodeKeys().length);
        expect(errorCodeValues().every((c) => /^E_[A-Z_]+$/.test(c))).toBe(true);
    });

    it('derives the 1.5.0 surface counts from the source constants', () => {
        const d = computeDerived(ROOT);
        expect(d).toMatchObject({
            commands: 21,
            schemaSubjects: 19,
            errorCodes: 12,
            globalFlags: 10,
            manifestCommands: 14,
            pdfaCorpus: 16,
            bundledFontModules: 31,
            unicodeScripts: 27,
            fontAliases: 4,
        });
        expect(d.samplePdfs).toBe(baselineEntryCount(ROOT));
        expect(d.samplePdfs).toBeGreaterThan(70);
        expect(d.testFiles).toBeGreaterThan(60);
        expect(d.renderSamples).toBeGreaterThan(50);
        expect(d.sampleScripts).toBeGreaterThan(60);
        expect(schemaSubjects()).toContain('manifest');
        expect(globalFlags()).toContain('--creation-date');
        expect(manifestCommands()).toContain('render');
        expect(manifestCommands()).not.toContain('ltv');
        expect(completionFlags('render')).toContain('--pdfx');
        expect(completionFlags('nope')).toBeNull();
    });

    it('every sample directory is a command or a known non-command family', () => {
        const dirs = sampleDirs(ROOT);
        expect(dirs).toContain('render');
        for (const dir of dirs) {
            expect(commandNames().includes(dir) || NON_COMMAND_SAMPLE_DIRS.includes(dir), `samples/${dir}`).toBe(true);
        }
    });

    it('every sample script has its dual-shell twin', () => {
        expect(unpairedSampleScripts(ROOT)).toEqual([]);
    });
});
