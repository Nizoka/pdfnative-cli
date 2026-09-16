// The embedded governance policy mirrors .github/ai-governance.json (1.1.0).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AI_GOVERNANCE_POLICY } from '../../src/utils/governance.js';

const file = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.github', 'ai-governance.json'), 'utf8')) as Record<string, unknown>;

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
