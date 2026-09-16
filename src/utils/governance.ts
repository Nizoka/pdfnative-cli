// AI-governance / Human-in-the-Loop (HITL) contract.
//
// pdfnative 1.5.0 introduced a monorepo-wide governance policy (issue #56): AI
// coding agents act as *draftsmen*, never autonomous submitters. Every issue /
// PR / release must be reviewed and triggered by a human, no runtime dependency
// may be added, and a local reproduction must accompany any bug report.
//
// This module makes that contract a first-class CLI capability: agents driving
// `pdfnative-cli` can emit the policy, print the human/agent rules, and — most
// importantly — validate a draft issue/PR against the policy BEFORE a human
// reviews and submits it. The validation logic is a pure, zero-dependency
// port of pdfnative's `scripts/verify-issue.mjs`, so the CLI honours its own
// zero-dependency contract.

/** Machine-readable governance policy (mirrors `.github/ai-governance.json`). */
export const AI_GOVERNANCE_POLICY = Object.freeze({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'pdfnative AI Governance Configuration',
    description:
        'Machine-readable contract governing how AI coding agents may propose issues, '
        + 'contributions, and changes across the pdfnative monorepo. Agents that scan '
        + 'repository configuration on initialization MUST honour this file.',
    version: '1.1.0',
    spec_updated: '2026-09-13',
    applies_to: ['pdfnative', 'pdfnative-cli', 'pdfnative-mcp', 'pdfnative-react'],
    policy: {
        automatic_issue_reporting: false,
        runtime_dependencies_allowed: false,
        human_in_the_loop_mandatory: true,
        autonomous_github_writes_allowed: false,
        required_issue_fields: ['minimal_reproduction', 'environment', 'expected_behavior'],
    },
    human_in_the_loop: {
        role_of_agent: 'draftsman',
        gate:
            'A human MUST explicitly review, sign off on, and trigger any GitHub issue, '
            + 'comment, PR, or release. The agent\'s authority ends at producing a local '
            + 'draft plus a compliance report.',
        identity_integrity:
            'Any issue or PR is published under the human user\'s GitHub identity. The '
            + 'agent MUST remind the user of their shared responsibility for the content '
            + 'before submission.',
        draft_location: '.github/drafts/',
    },
    pre_issue_checklist: [
        'no_duplicate_open_or_closed_issue',
        'zero_runtime_dependency_preserved',
        'local_minimal_reproduction_executed',
        'expected_vs_actual_documented',
        'environment_captured',
    ],
    compliance_report: {
        required_fields: [
            'zero_dependency_confirmed',
            'reproduction_command',
            'reproduction_result',
            'duplicate_search_performed',
            'affected_packages',
            'identity_reminder_shown',
        ],
    },
    capability_manifest: {
        sources: ['AGENTS.md', '.github/AGENT_RULES.md'],
        on_demand: [
            'docs/assets/ecosystem.json',
            'docs/AGENT_CONTRACT.md',
            '.github/instructions/',
            'ROADMAP.md',
            'SECURITY.md',
            'llms.txt',
        ],
    },
    verification: {
        command: 'pdfnative govern verify-issue <draft.md>',
        blocks_submission_on_failure: true,
    },
} as const);

/** Human-and-agent-readable protocol (mirrors `.github/AGENT_RULES.md`). */
export const AGENT_RULES_TEXT = `\
# AI Agent Rules for the pdfnative ecosystem

You are an AI assistant helping a user develop or fix pdfnative (or its CLI,
MCP, or React packages). You act as a DRAFTSMAN, never as an autonomous
submitter.

## Mandatory pre-issue rules

1. Zero runtime dependencies. Never suggest, add, or import an external npm
   package for a runtime feature. This is a non-negotiable blocker.
2. No duplicates. Search open AND closed issues/PRs before proposing anything.
3. Local validation & reproduction. Create and EXECUTE a minimal reproduction
   script locally. If it does not fail, do not propose an issue.
4. Byte-identity awareness. Confirm builder changes are additive and existing
   output paths stay byte-identical; report any intentional byte changes.
5. Human-in-the-loop gate (ethics). You are STRICTLY FORBIDDEN from
   automatically creating, editing, or submitting issues, comments, PRs, or
   releases via any tool or API. Produce a local markdown draft and present it
   to the user with a compliance report. The user must explicitly approve and
   trigger any submission.
6. Identity integrity. Remind the user that anything submitted is published
   under THEIR GitHub identity and that they share responsibility for it.

## Validate a draft before presenting it

    pdfnative govern verify-issue ./draft.md

A passing check is NECESSARY BUT NOT SUFFICIENT — the human review gate above
always applies.

## What agents must NOT do

- Add a runtime dependency.
- Open, edit, label, close, or comment on issues/PRs autonomously.
- Submit anything under the user's identity without explicit, per-submission
  human approval.
- Bypass local validation or duplicate checks.
`;

/** Result of validating a draft issue/PR against the governance policy. */
export interface GovernanceValidation {
    readonly ok: boolean;
    readonly errors: readonly string[];
    readonly warnings: readonly string[];
}

/** Patterns that indicate an external runtime dependency is being proposed. */
const DEPENDENCY_PATTERNS: readonly RegExp[] = [
    /\bnpm\s+(install|i|add)\s+(?!--)[a-z@]/i,
    /\b(yarn|pnpm|bun)\s+add\s+/i,
    /\bpnpm\s+install\s+[a-z@]/i,
    /add\s+[`"']?[\w@/-]+[`"']?\s+to\s+(the\s+)?(runtime\s+)?dependencies\b/i,
    /"dependencies"\s*:\s*\{[^}]*[\w-]+[^}]*\}/i,
];

/** Required issue fields (advisory — surfaced as warnings when missing). */
const REQUIRED_FIELDS: readonly { key: string; re: RegExp }[] = [
    { key: 'minimal_reproduction', re: /repro|reproduc/i },
    { key: 'environment', re: /environment|version|node|os\b/i },
    { key: 'expected_behavior', re: /expected/i },
];

/**
 * Validate a draft issue/PR markdown against the AI-governance policy.
 *
 * Errors (fail): proposing an external runtime dependency, or missing a
 * reproduction code block. Warnings (advisory): a recommended field appears
 * to be missing. A pure function — no filesystem access — so it is trivially
 * testable and reusable.
 */
export function validateGovernanceDraft(content: string): GovernanceValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const re of DEPENDENCY_PATTERNS) {
        if (re.test(content)) {
            errors.push('Proposing an external dependency violates the zero-dependency policy.');
            break;
        }
    }

    if (!/```[\s\S]*?```/.test(content)) {
        errors.push('No reproduction code block found — include a minimal repro inside a fenced ``` block.');
    }

    for (const field of REQUIRED_FIELDS) {
        if (!field.re.test(content)) {
            warnings.push(`Recommended field appears to be missing: ${field.key}.`);
        }
    }

    return { ok: errors.length === 0, errors, warnings };
}
