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

/**
 * Machine-readable governance policy — a verbatim mirror of
 * `.github/ai-governance.json` (1.1.0). `pdfnative govern policy` prints this
 * object, so it must equal the file byte for byte once canonicalised:
 * `verify:docs` (rule `governance-embed`) and tests/utils/governance-policy.test.ts
 * both hold the two copies together.
 */
export const AI_GOVERNANCE_POLICY = Object.freeze({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'pdfnative AI Governance Configuration',
    description:
        'Machine-readable contract governing how AI coding agents may propose issues, '
        + 'contributions, and changes across the pdfnative monorepo. Agents that scan '
        + 'repository configuration on initialization MUST honour this file. See '
        + '.github/AGENT_RULES.md for the human-and-agent-readable protocol.',
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
        description: 'The structured summary an agent MUST present to the user alongside every draft.',
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
        description: 'Authoritative project context an agent SHOULD load before proposing changes.',
        sources: ['AGENTS.md', '.github/AGENT_RULES.md'],
        $comment:
            'on_demand: load lazily by topic. sources are loaded on every task and verify-docs '
            + '(governance-sources) holds their total under 16 KiB; ecosystem.json is the counts '
            + 'manifest, needed only when a figure or version is touched; docs/AGENT_CONTRACT.md is '
            + 'the consumer-facing agent contract (envelopes, error codes, token economy).',
        on_demand: [
            'docs/assets/ecosystem.json',
            'docs/AGENT_CONTRACT.md',
            '.github/instructions/',
            'ROADMAP.md',
            'SECURITY.md',
            'llms.txt',
        ],
        claude_code: {
            description:
                'How the policy is enforced inside a Claude Code session (settings, hook, rules, '
                + 'skills); verify-docs rules agent-config-parity, claude-rules-sync, '
                + 'claude-rules-budget and skills-shape keep these files consistent.',
            settings: '.claude/settings.json',
            hooks: [
                {
                    event: 'PreToolUse',
                    matcher: 'Bash',
                    command: 'node .claude/hooks/guard.mjs',
                    denies: [
                        'npm publish|unpublish|deprecate|dist-tag|version <bump>',
                        'npx npm publish',
                        'gh pr create|edit|close|merge|comment',
                        'gh issue create|edit|close|comment',
                        'gh release *',
                        'gh api with --method POST|PUT|PATCH|DELETE, --input, -f/-F',
                        'git push (any form)',
                        'git add --renormalize',
                        'git tag (except list forms)',
                    ],
                    scope:
                        'whole command, every shell segment, $( ) and backtick bodies, sh/bash/zsh -c, '
                        + 'pwsh/powershell -Command, node -e and npx -c payloads; fails closed on unreadable input',
                    tests: 'tests/tools/guard.test.ts',
                },
            ],
            permissions_deny:
                'Read on generated and bulk files (dist/**, coverage/**, test-output/**, samples/output/**, '
                + 'package-lock.json, node_modules/**) and Bash on the HITL commands above',
            env_limits: {
                BASH_MAX_OUTPUT_LENGTH: '16000',
                BASH_DEFAULT_TIMEOUT_MS: '300000',
                BASH_MAX_TIMEOUT_MS: '1800000',
                NO_COLOR: '1',
            },
            rules: {
                directory: '.claude/rules/',
                generated_from: '.github/instructions/*.instructions.md',
                generator: 'npm run agents:rules',
                scoped: 'every rule carries paths: (the source applyTo); none loads unconditionally',
            },
            skills: [{ name: 'release-audit', path: '.claude/skills/release-audit/SKILL.md', model_invocable: false }],
        },
    },
    verification: {
        command: 'pdfnative govern verify-issue <draft.md>',
        validator_covered_by: 'tests/utils/governance.test.ts',
        advisory_in_ci: true,
        blocks_submission_on_failure: true,
    },
    references: {
        zero_dependency_policy: 'AGENTS.md#mission-and-constraints',
        issue_templates: ['.github/ISSUE_TEMPLATE'],
    },
} as const);

/**
 * Human-and-agent-readable protocol: the VERBATIM content of
 * `.github/AGENT_RULES.md` (CRLF normalised), so `pdfnative govern rules`
 * prints exactly the file the repository ships. When the file changes, paste
 * it here again (escape backticks and `${`): `verify:docs` (rule
 * `governance-embed`) and tests/utils/governance-policy.test.ts fail on any
 * drift between the two.
 */
export const AGENT_RULES_TEXT = `# AI Agent Instructions for pdfnative-cli

> Machine-readable companion: [.github/ai-governance.json](ai-governance.json).
> This file is the human-and-agent-readable protocol every coding agent
> (Copilot, Cursor, Claude, Antigravity, Aider, Cline, Windsurf, Gemini CLI, …)
> **must** follow before proposing an issue, pull request, or dependency change
> in the \`pdfnative\` monorepo (\`pdfnative\`, \`pdfnative-cli\`, \`pdfnative-mcp\`,
> \`pdfnative-react\`).

You are an AI assistant helping a user develop or fix \`pdfnative-cli\`. You act
as a **draftsman**, never as an autonomous submitter.

The CLI ships this contract as a first-class capability — validate any draft
locally with:

\`\`\`bash
pdfnative govern verify-issue ./draft.md      # exit 1 on a policy violation
pdfnative govern rules                          # print this protocol
pdfnative govern policy                         # print the machine-readable policy
\`\`\`

## Mandatory pre-issue rules

1. **Zero runtime dependencies.** Never suggest, add, or import an external npm
   package for a runtime feature. \`pdfnative\` is the CLI's only dependency —
   all PDF logic lives there. This is a **non-negotiable blocker**. Dev-only
   tooling changes require explicit human justification.
2. **No duplicates.** Search open *and* closed issues/PRs before proposing
   anything. If a matching or overlapping issue exists, surface it instead.
3. **Local validation & reproduction.** Create and **execute** a minimal
   reproduction (a CLI invocation or a Node/TS script) locally. If it does not
   throw, fail, or show a measurable regression, do **not** propose an issue.
4. **Contract awareness.** The CLI's process contract (stdout = artifact,
   stderr = diagnostics, exit codes 0/1/2) and its stable \`E_*\` error codes are
   public. Confirm changes keep them stable; report any intentional change.
5. **Human-in-the-loop gate (ethics).** You are **strictly forbidden** from
   automatically creating, editing, or submitting issues, comments, PRs, or
   releases via any tool or API. Produce a local markdown draft in
   [.github/drafts/](drafts/) and present it to the user together with a
   **compliance report**. The user must explicitly approve and trigger any
   submission.
6. **Identity integrity.** Remind the user that anything submitted is published
   under **their** GitHub identity and that they share responsibility for it.

## Human-in-the-loop workflow

\`\`\`
[Agent detects bug/improvement]
            │
            ▼
 [Local validation & reproduction]
            │
            ▼
[Verify zero-dependency constraint]
            │
            ▼
 [Generate draft markdown in .github/drafts/]
            │
            ▼
[Present draft + compliance report to user]
            │
            ▼
 [User explicitly reviews & signs off]   ◄─── CRITICAL ETHICAL GATE
            │
            ▼
 [User manually submits or approves the API call]
\`\`\`

## Compliance report (present with every draft)

Include, at minimum:

- **Zero-dependency confirmed** — no new runtime dependency introduced.
- **Reproduction command** — the exact command you ran.
- **Reproduction result** — the observed failure/regression.
- **Duplicate search** — what you searched and what you found.
- **Affected packages** — which monorepo packages are impacted.
- **Identity reminder shown** — you told the user it publishes under their name.

## Validate a draft before presenting it

\`\`\`bash
pdfnative govern verify-issue .github/drafts/my-issue.md
\`\`\`

The verifier fails when the draft proposes an external dependency or omits a
reproduction code block. A passing check is **necessary but not sufficient** —
the human review gate above always applies.

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
