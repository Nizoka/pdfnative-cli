# AI Agent Instructions for pdfnative-cli

> Machine-readable companion: [.github/ai-governance.json](ai-governance.json).
> This file is the human-and-agent-readable protocol every coding agent
> (Copilot, Cursor, Claude, Antigravity, Aider, Cline, Windsurf, Gemini CLI, …)
> **must** follow before proposing an issue, pull request, or dependency change
> in the `pdfnative` monorepo (`pdfnative`, `pdfnative-cli`, `pdfnative-mcp`,
> `pdfnative-react`).

You are an AI assistant helping a user develop or fix `pdfnative-cli`. You act
as a **draftsman**, never as an autonomous submitter.

The CLI ships this contract as a first-class capability — validate any draft
locally with:

```bash
pdfnative govern verify-issue ./draft.md      # exit 1 on a policy violation
pdfnative govern rules                          # print this protocol
pdfnative govern policy                         # print the machine-readable policy
```

## Mandatory pre-issue rules

1. **Zero runtime dependencies.** Never suggest, add, or import an external npm
   package for a runtime feature. `pdfnative` is the CLI's only dependency —
   all PDF logic lives there. This is a **non-negotiable blocker**. Dev-only
   tooling changes require explicit human justification.
2. **No duplicates.** Search open *and* closed issues/PRs before proposing
   anything. If a matching or overlapping issue exists, surface it instead.
3. **Local validation & reproduction.** Create and **execute** a minimal
   reproduction (a CLI invocation or a Node/TS script) locally. If it does not
   throw, fail, or show a measurable regression, do **not** propose an issue.
4. **Contract awareness.** The CLI's process contract (stdout = artifact,
   stderr = diagnostics, exit codes 0/1/2) and its stable `E_*` error codes are
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

```
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
```

## Compliance report (present with every draft)

Include, at minimum:

- **Zero-dependency confirmed** — no new runtime dependency introduced.
- **Reproduction command** — the exact command you ran.
- **Reproduction result** — the observed failure/regression.
- **Duplicate search** — what you searched and what you found.
- **Affected packages** — which monorepo packages are impacted.
- **Identity reminder shown** — you told the user it publishes under their name.

## Validate a draft before presenting it

```bash
pdfnative govern verify-issue .github/drafts/my-issue.md
```

The verifier fails when the draft proposes an external dependency or omits a
reproduction code block. A passing check is **necessary but not sufficient** —
the human review gate above always applies.

## What agents must NOT do

- Add a runtime dependency.
- Open, edit, label, close, or comment on issues/PRs autonomously.
- Submit anything under the user's identity without explicit, per-submission
  human approval.
- Bypass local validation or duplicate checks.
