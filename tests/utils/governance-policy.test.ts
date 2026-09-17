// The embedded governance policy mirrors .github/ai-governance.json (1.1.0).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AI_GOVERNANCE_POLICY, AGENT_RULES_TEXT } from '../../src/utils/governance.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const file = JSON.parse(readFileSync(join(ROOT, '.github', 'ai-governance.json'), 'utf8')) as Record<string, unknown>;

describe('AGENT_RULES_TEXT ↔ .github/AGENT_RULES.md (v1.5.0, audit B-08)', () => {
    it('is the file, verbatim (CRLF normalised) — what `pdfnative govern rules` prints', () => {
        const rules = readFileSync(join(ROOT, '.github', 'AGENT_RULES.md'), 'utf8').replace(/\r\n/g, '\n');
        expect(AGENT_RULES_TEXT).toBe(rules);
    });

    it('carries the CLI-specific protocol, not the engine wording', () => {
        expect(AGENT_RULES_TEXT).toContain('Contract awareness');
        expect(AGENT_RULES_TEXT).toContain('.github/drafts/');
        expect(AGENT_RULES_TEXT).not.toContain('Byte-identity awareness');
    });

    it('references an anchor that exists (zero_dependency_policy)', () => {
        const ref = AI_GOVERNANCE_POLICY.references.zero_dependency_policy;
        const [path, fragment] = ref.split('#');
        const text = readFileSync(join(ROOT, path as string), 'utf8');
        const headings = [...text.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)].map((m) => (m[1] as string).trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s+/g, '-'));
        expect(headings).toContain(fragment);
    });
});

describe('AI_GOVERNANCE_POLICY ↔ .github/ai-governance.json', () => {
    it('is version 1.1.0 (pdfnative 1.8.0 policy) with a spec date', () => {
        expect(AI_GOVERNANCE_POLICY.version).toBe('1.1.0');
        expect(AI_GOVERNANCE_POLICY.spec_updated).toBe(file.spec_updated);
    });

    it('mirrors every policy-bearing field of the JSON file', () => {
        for (const key of ['version', 'applies_to', 'policy', 'human_in_the_loop', 'pre_issue_checklist'] as const) {
            expect(AI_GOVERNANCE_POLICY[key], key).toEqual(file[key]);
        }
        expect(AI_GOVERNANCE_POLICY.compliance_report.required_fields).toEqual((file.compliance_report as { required_fields: string[] }).required_fields);
        const manifest = file.capability_manifest as { sources: string[]; on_demand: string[] };
        expect(AI_GOVERNANCE_POLICY.capability_manifest.sources).toEqual(manifest.sources);
        expect(AI_GOVERNANCE_POLICY.capability_manifest.on_demand).toEqual(manifest.on_demand);
        expect(AI_GOVERNANCE_POLICY.verification.command).toBe((file.verification as { command: string }).command);
    });
});
