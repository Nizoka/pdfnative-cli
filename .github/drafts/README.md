# AI-agent issue / PR drafts

This directory holds **locally-drafted** issues and pull requests produced by AI
coding agents under the pdfnative Human-in-the-Loop governance policy
(see [../AGENT_RULES.md](../AGENT_RULES.md) and
[../ai-governance.json](../ai-governance.json)).

Nothing here is submitted automatically. A human must review, sign off on, and
manually submit any draft under their own GitHub identity.

Start from [TEMPLATE.md](TEMPLATE.md) (copy it to `<slug>.md` here — every other
`.md` in this directory is git-ignored, so a draft never lands in a commit by
accident), fill every section, then validate it before review:

```bash
pdfnative govern verify-issue .github/drafts/<slug>.md
```
