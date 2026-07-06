import { describe, it, expect } from 'vitest';
import {
    validateGovernanceDraft,
    AI_GOVERNANCE_POLICY,
    AGENT_RULES_TEXT,
} from '../../src/utils/governance.js';

describe('validateGovernanceDraft', () => {
    const goodDraft = `# Bug: rendering fails

## Environment
Node 20, Windows 11.

## Expected behavior
It should render.

## Reproduction
\`\`\`js
render();
\`\`\`
`;

    it('passes a compliant draft', () => {
        const r = validateGovernanceDraft(goodDraft);
        expect(r.ok).toBe(true);
        expect(r.errors).toHaveLength(0);
    });

    it('fails when a runtime dependency is proposed', () => {
        const r = validateGovernanceDraft('Please run `npm install lodash`.\n\n```\nx\n```');
        expect(r.ok).toBe(false);
        expect(r.errors.join(' ')).toMatch(/zero-dependency/i);
    });

    it.each([
        'yarn add left-pad',
        'pnpm add chalk',
        'bun add zod',
        'add `axios` to the runtime dependencies',
    ])('flags dependency phrasing %j', (line) => {
        const r = validateGovernanceDraft(`${line}\n\n\`\`\`\nrepro\n\`\`\``);
        expect(r.ok).toBe(false);
    });

    it('fails when no reproduction code block is present', () => {
        const r = validateGovernanceDraft('A bug with expected behaviour on node 20.');
        expect(r.ok).toBe(false);
        expect(r.errors.join(' ')).toMatch(/reproduction code block/i);
    });

    it('warns about missing recommended fields', () => {
        const r = validateGovernanceDraft('```\nrepro here\n```');
        expect(r.ok).toBe(true);
        expect(r.warnings.length).toBeGreaterThan(0);
    });
});

describe('governance constants', () => {
    it('exposes the monorepo scope and HITL policy', () => {
        expect(AI_GOVERNANCE_POLICY.applies_to).toContain('pdfnative-cli');
        expect(AI_GOVERNANCE_POLICY.policy.human_in_the_loop_mandatory).toBe(true);
        expect(AI_GOVERNANCE_POLICY.policy.runtime_dependencies_allowed).toBe(false);
    });

    it('documents the draftsman role in the rules text', () => {
        expect(AGENT_RULES_TEXT).toMatch(/draftsman/i);
        expect(AGENT_RULES_TEXT).toMatch(/verify-issue/);
    });
});
