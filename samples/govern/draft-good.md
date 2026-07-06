# Bug: `render` drops the last table row when `repeatHeader` is enabled

## Environment
- pdfnative-cli: 1.2.0
- pdfnative: 1.5.0
- Node.js: 20.11.0
- OS: Ubuntu 24.04

## Expected behavior
Every row supplied in the JSON table should appear in the rendered PDF, even
when `repeatHeader` splits the table across a page boundary.

## Actual behavior
The final data row is missing whenever the table wraps to a second page.

## Minimal reproduction

```bash
pdfnative render --input repro.json --output repro.pdf
pdfnative inspect --input repro.pdf --summary
# → pages: 2, but the last row of the table is absent on page 2
```

`repro.json` contains a single 60-row table with `smart.repeatHeader: true`.

## Notes
- Zero runtime dependencies added or required to reproduce.
- Searched open and closed issues — no existing report found.
