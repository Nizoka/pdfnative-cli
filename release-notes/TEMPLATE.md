# Release Notes Template

This directory contains release notes for each published version of `pdfnative-cli`.

## File naming

- One file per version: `release-notes/vMAJOR.MINOR.PATCH.md`
- Examples: `v0.1.0.md`, `v0.2.0.md`, `v1.0.0.md`

## Template

Copy the content below into a new `release-notes/vX.Y.Z.md` file and fill in the sections. Omit any section that has no entries for the release (do not leave empty sections).

```markdown
# pdfnative-cli vX.Y.Z

<!-- GitHub Release title: vX.Y.Z — short description -->

_Released YYYY-MM-DD_

<!-- One-paragraph summary: what is this release about (feature / refactor / polish / security) and compatibility statement (e.g. "100% backward-compatible with vX.Y.Z-1"). -->

## Highlights

<!-- 2–5 bullets calling out the most user-visible changes. Link to detailed sections below where useful. -->

- ...

## Security

<!-- CVE-style entries: CWE reference, affected versions, mitigation. Keep this section first when present. -->

- **fix(security):** ...

## Breaking Changes

<!-- Only for MAJOR bumps. Each entry must include: what changed, why, migration path. -->

- **BREAKING:** ...

## Added

<!-- New commands, new flags, new samples. Use conventional commit scopes: feat(render), feat(sign), feat(samples), etc. -->

- **feat(scope):** ...

## Changed

<!-- Non-breaking behavior changes, sample updates, dependency updates. -->

- **chore(meta):** ...
- **docs(samples):** ...

## Fixed

<!-- Bug fixes. Reference GitHub issues (#NN) where applicable. -->

- **fix(scope):** ... ([#NN]).

## Deprecated

<!-- CLI flags/commands kept working but scheduled for removal in a future MAJOR. Include the target version. -->

- **deprecate(scope):** `--old-flag` — use `--new-flag` instead. Will be removed in vX+1.0.0.

## Removed

<!-- Only for MAJOR bumps. Cross-reference the deprecation notice from a prior release. -->

- **remove(scope):** ... (deprecated in vX.Y.Z).

## Performance

<!-- Benchmark deltas or observed improvements. -->

- **perf(scope):** improved X by N% (measured on Node 22.x, median of 5 runs).

## Documentation

<!-- README / KNOWLEDGE_BASE / sample reference updates. -->

- **docs(scope):** ...

## Install

\`\`\`bash
npm install --global pdfnative-cli@X.Y.Z
\`\`\`

## Upgrade

<!-- Step-by-step migration if non-trivial. For PATCH releases with no breaking changes, one sentence suffices. -->

No breaking changes. Drop-in replacement for vX.Y.Z-1.

## Verification

All checks passed:
- `npm run typecheck:all` — clean
- `npm run lint` — 0 errors
- `npm run test` — all passing
- `npm run build` — dist output verified

## Contributors

<!-- Optional: acknowledge external contributors for this release. -->

Thanks to contributors and community feedback.
```
