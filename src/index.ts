import { parseArgs, hasFlag, getStringFlag, GLOBAL_BOOLEAN_FLAGS } from './utils/args.js';
import { splitCommandArgv } from './utils/argv.js';
import { CliError } from './utils/error.js';
import { isJsonMode, emitJsonError } from './utils/agent.js';
import { loadConfig, applyConfigDefaults } from './utils/config.js';
import { cliVersion } from './utils/version.js';
import { resolveReproducibleDate } from './utils/reproducible.js';

// Lazy-import commands to keep startup fast for --help / --version
type CommandFn = (args: ReturnType<typeof parseArgs>) => Promise<void>;

const USAGE = `\
pdfnative-cli — Official CLI for pdfnative

Usage:
  pdfnative <command> [options]

Commands (21):

 Create & edit
  render      Render a JSON document definition to PDF
  fill        Fill / flatten / export an AcroForm PDF
  annotate    Attach markup annotations to a PDF
  metadata    Update PDF /Info + XMP metadata (incremental — keeps signatures)

 Page tree
  merge       Concatenate multiple PDFs into one
  split       Split a PDF into multiple PDFs (per page or range)
  extract     Extract selected pages into a new PDF

 Security
  sign        Apply a digital signature to a PDF (RFC 3161 timestamp, multi-sig)
  verify      Verify embedded PDF signatures
  ltv         PAdES B-LT: collect/embed OCSP+CRL validation data (/DSS)
  doc-timestamp  PAdES B-LTA: append an RFC 3161 document timestamp
  encrypt     Re-secure a PDF with AES-128/256 encryption
  decrypt     Remove encryption from a PDF (with --password)

 Read & extract
  inspect     Analyse a PDF (metadata, conformance, form fields, encryption)
  extract-text  Extract reading-order text (text | json | ndjson)
  compare     Diff two PDFs by text and structure (CI-friendly exit codes)

 Automation & meta
  batch       Render a directory or run a multi-command manifest pipeline
  doctor      Environment / capability preflight (text or --json)
  schema      Print a JSON Schema / capability manifest for agents
  completion  Emit a shell completion script (bash|zsh|fish|powershell)
  govern      AI-governance / HITL contract (rules, policy, verify-issue)

Options:
  --help,    -h   Show this help message
  --version, -V   Show version (add --json for machine-readable output)

Global options (any command; may be placed before or after the command name):
  --config <file>   Use a specific .pdfnativerc.json (default: nearest upward)
  --no-config       Ignore any .pdfnativerc.json
  --quiet,   -q     Suppress progress output on stderr
  --no-color        Disable ANSI colour (also respects NO_COLOR)
  --json            Agent mode: emit a JSON status/error envelope on stderr
                    (data stays on stdout). Errors carry a stable code.
  --dry-run         Validate inputs and exit without writing output (render,
                    sign, batch, merge, split, extract, annotate, fill,
                    encrypt, decrypt, metadata, ltv, doc-timestamp). Never
                    performs network I/O, even when a network flag is present.
  --max-inflate-size <bytes>
                    Cap the decompressed size of any single PDF stream while
                    parsing untrusted input (anti zip-bomb; default 100 MiB).
  --creation-date <iso8601>
                    Pin the creation instant of every PDF written in this run
                    (render, batch): /CreationDate, xmp:CreateDate, the {date}
                    placeholder and the trailer /ID derive from it, all in UTC,
                    so the output is byte-identical on every host. Falls back
                    to $SOURCE_DATE_EPOCH (integer seconds) when absent.
                    Encrypted output is never byte-reproducible (CSPRNG keys);
                    sign --signing-time and metadata --mod-date are separate.

For autonomous/agent usage see docs/AGENT_CONTRACT.md.
Run \`pdfnative <command> --help\` for per-command options.
`;

const RENDER_USAGE = `\
pdfnative render — Render a JSON document definition to PDF

Usage:
  pdfnative render [--input <file>] [--output <out.pdf>] [options]

I/O:
  --input,   -i   Path to JSON input (default: stdin)
  --output,  -o   Output PDF path (default: stdout)
  --stream        Stream output (large documents). Single-pass; incompatible
                  with TOC blocks and with header/footer templates that
                  contain {pages}.
  --stream-page-by-page
                  Stream output chunked at PDF object boundaries. Assembles
                  the full document first, so TOC blocks and {pages} ARE
                  supported. Mutually exclusive with --stream.
  --stream-true   True constant-memory streaming (pdfnative 1.3.0): parts are
                  emitted and freed as they go, so the joined binary never
                  materialises. Same constraints as --stream (no TOC, no
                  {pages}); byte-identical output. Mutually exclusive with the
                  other --stream* flags.
  --chunk-size    Chunk size in bytes for --stream / --stream-true (default
                  65536). Not applicable to --stream-page-by-page.
  --watch         Re-render on input file change (requires --input and a
                  file --output; logs to stderr; debounce 200 ms).
  --template      Path to JSON template file. Stdin / --input is deep-merged
                  on top (caller wins; arrays replace).
  --outline       auto (bookmarks from headings) or a JSON outline file
  --debug-layout  Draw the layout-debug overlay (boxes/baselines) in the PDF
  --inspect-layout
                  Emit the block-placement report as JSON on stdout instead
                  of rendering the PDF

Variant:
  --variant       document (default) or table

Smart tables (document variant; fills TableBlock fields left unset in JSON):
  --table-wrap        auto (default) | always | never
  --repeat-header     [true|false] repeat header row on continuation pages
  --zebra             [true|false|"R G B"] alternate-row striping
  --min-row-height    Minimum row height in points
  --cell-padding      Horizontal cell padding in points
                  (caption is per-table — set it in the JSON TableBlock)

Layout (flags override values from --layout file; the nested typography and
outputIntent objects merge one level deep instead of replacing each other):
  --layout        Path to JSON layout file (PdfLayoutOptions; 50 MB cap; a
                  creationDate ISO string and outputIntent.iccProfile number[]
                  are revived)
  --page-size     Named (a4|letter|legal|a3|tabloid|a5) or WxH in points
  --margin        Uniform N or "top,right,bottom,left" in points
  --compress      Enable Flate compression (initialises Node compression)
  --max-blocks    Max document blocks before pdfnative aborts (default 100000)

Conformance (one claim per file — --tagged and --pdfx are mutually exclusive):
  --tagged        none|pdfa1b|pdfa2b|pdfa2u|pdfa3b (PDF/A claim)
  --pdfx [pdfx4]  PDF/X-4 claim (ISO 15930-7; pdfnative 1.8.0). Needs an
                  output (printer) ICC profile, every font embedded (--font
                  latin --lang latin), metadata.trapped True|False and a
                  TrimBox or ArtBox per page. Forbids encryption. Check the
                  result with \`pdfnative inspect --check pdfx\`.
  --output-intent-icc <file.icc>
                  ICC profile for layout.outputIntent (RGB, CMYK or Gray;
                  \`prtr\` class for PDF/X-4; validated by the engine; 16 MB
                  cap). RGB content under a CMYK/Gray intent stays conformant
                  through a calibrated /DefaultRGB.
  --output-intent-id <string>
                  outputConditionIdentifier (default: the ICC file's basename)
  --trapped       true|false|unknown → /Info /Trapped (PDF/X needs true|false)
  --strict        Escalate conformance diagnostics into an error BEFORE any
                  output byte (exit 1, E_CHECK_FAILED): PDFA_NO_FONT_ENTRIES,
                  PDFA_UNEMBEDDED_FORM_FONT, PDFA_DEVICE_CMYK_IMAGE,
                  PDFA_DEVICE_CMYK_CONTENT, PDFA_ICC_PROFILE_VERSION,
                  PDFX_NO_FONT_ENTRIES, PDFX_DEVICE_CMYK, PDFX_ANNOTATIONS,
                  TYPOGRAPHY_FEATURE_INEFFECTIVE. Without it, diagnostics are
                  stderr warnings (and a diagnostics[] array in the --json
                  envelope). PDF/X coherence errors (layout.pdfx and
                  layout.tagged combined, missing output profile, unknown
                  trapping state, …) are E_INPUT.
  --conformance   DEPRECATED — alias for --tagged pdfa{1b|2b|3b}

Typography (pdfnative 1.8.0 layout.typography; the full option set —
widows/orphans, unitBinding, bindShortWords, punctuationSpacing fr|fr-CA,
opticalMargins, metrics exact, hyphenationLanguage — lives in the JSON):
  --split-paragraphs        [true|false] paragraphs may break across pages
                            (widows/orphans default to 2)
  --keep-headings-with-next [true|false] a heading never ends a page alone
  --kerning                 [true|false] pair kerning (needs a registered font)
  --font-features <tags>    Comma-separated OpenType features: tnum, pnum,
                            lnum, onum, zero, ordn, sups, subs, smcp, c2sc,
                            case (TYPOGRAPHY_FEATURE_INEFFECTIVE warns when a
                            tag changes nothing in the font)
  Paragraph blocks accept align "justify", keepWithNext and splittable; text
  may carry soft hyphens (U+00AD). Colours everywhere accept CMYK too:
  [c, m, y, k] percent or "c m y k" operands 0–1 (DeviceCMYK).

Fonts:
  --lang          Comma-separated language packs (e.g. th,ja,ar,te,si,km).
                  ha, yo, ig and sw (Hausa, Yoruba, Igbo, Swahili) are aliases
                  of latin — combining tone marks are anchored by Noto Sans.
  --font          Register a bundled font shortcut (repeatable). The name
                  doubles as the --lang code. Allowed: latin, emoji,
                  color-emoji, math, and the 27 script codes ar, hy, bn, ru,
                  hi, am, ka, el, he, ja, km, ko, my, pl, zh, si, ta, te, th,
                  bo, tr, vi, lo, nod, khb, tdd, cjm (Lao, Tai Tham, New Tai
                  Lue, Tai Le and Cham since pdfnative 1.8.0).
  --font-file <path.ttf>[:name]
                  Register a TrueType/OpenType font you ship (repeatable) and
                  embed it (added to --lang). Guarded: path checked, 32 MB
                  cap, sfnt signature required (no collections, no WOFF),
                  parsed and validated by pdfnative's font compiler before
                  registration; never loaded from JSON. Name defaults to the
                  file's basename ([a-z0-9-]).

Images (document blocks):
  { "type": "image", "src": "logo.png" }        path, resolved relative to the
                                                --input JSON's directory
  { "type": "image", "dataBase64": "…" }        inline base64 (JPEG/PNG)
  Print production (bleed/trimBox/artBox/marks incl. colourBars/userUnit),
  outputIntent and viewerPreferences (duplex, numCopies, printPageRange,
  pickTrayByPDFSize) are set in the --layout JSON — see
  \`pdfnative schema render\`.

Header / Footer:
  --header-left, --header-center, --header-right
  --footer-left, --footer-center, --footer-right
                  Each accepts a template string. {page}, {pages}, {date} and
                  {title} are substituted by pdfnative; {date} follows
                  --creation-date / layout.creationDate when pinned.

Watermark:
  --watermark-text       Text watermark
  --watermark-image      Image path (PNG/JPEG)
  --watermark-opacity    0.0–1.0
  --watermark-angle      degrees (text watermark)
  --watermark-color      PdfColor (hex "#rrggbb", "r g b", CMYK "c m y k", …)
  --watermark-font-size  points (text watermark)
  --watermark-position   background | foreground

Encryption (mutually exclusive with --tagged pdfa*):
  --encrypt [aes-128|aes-256]
                         Enable encryption (bare = aes-128)
  --owner-password       (or env $PDFNATIVE_ENCRYPT_OWNER_PASS — env wins)
  --user-password        (or env $PDFNATIVE_ENCRYPT_USER_PASS — env wins)
  --permissions          Comma-separated: print,copy,modify,extract
                         (Legacy aliases still accepted: --encrypt-algorithm,
                          --encrypt-owner-pass, --encrypt-user-pass,
                          --encrypt-permissions.)

Attachments (PDF/A-3, repeatable):
  --attachment <path>[:mime[:rel[:desc]]]
                  rel = Source|Data|Alternative|Supplement|Unspecified

  --help,    -h   Show this help message
`;

const SIGN_USAGE = `\
pdfnative sign — Apply a digital signature to a PDF

Usage:
  pdfnative sign [--input <file.pdf>] [--output <out.pdf>] [--key <key.pem>] [--cert <cert.pem>]

I/O:
  --input,   -i   Path to input PDF (default: stdin)
  --output,  -o   Signed PDF output path (default: stdout)

Credentials (env wins over file flags):
  --key           Path to PEM private key (env: PDFNATIVE_SIGN_KEY)
  --cert          Path to PEM signer certificate (env: PDFNATIVE_SIGN_CERT)
  --cert-chain    Path to PEM intermediate (repeatable; env: PDFNATIVE_SIGN_CHAIN)

Algorithm:
  --algorithm     rsa-sha256 (default) or ecdsa-sha256 (P-256 SEC1 keys).
  --digest        sha256 (default) | sha384 | sha512 — CMS digest. RSA only;
                  ecdsa is sha256-only.
  --profile       pkcs7 (default) or pades (ETSI.CAdES.detached, PAdES B-B:
                  ESS signing-certificate-v2, omits signing-time).

Signing engine:
  --pure-crypto   Force pdfnative's pure-JS RSA/ECDSA signer. By default the CLI
                  signs via a native, constant-time (side-channel-resistant)
                  node:crypto/OpenSSL provider.

Signature metadata (optional):
  --reason        Reason text shown in signature panel
  --name          Signer name override
  --location      Signing location
  --contact       Contact info
  --signing-time  ISO 8601 timestamp (default: now)

Placement & multiple signatures:
  --allow-multiple      Allow signing an already-signed PDF (appends a second
                        signature field; default: idempotent single-signature)
  --field-name <name>   Signature form-field name (default: auto)
  --signature-rect "x1,y1,x2,y2"
                        Visible signature widget rectangle (PDF points)
  --signature-page <n>  1-based page for the signature widget (default: 1)
  --placeholder-bytes <n>
                        Explicit /Contents placeholder size (overrides the
                        automatic estimate)

Trusted timestamp (PAdES B-T — OPT-IN NETWORK, SSRF-guarded):
  --timestamp <url>       RFC 3161 TSA URL. Embeds a verified timestamp token
                          in the CMS unsigned attributes at signing time.
                          Combine with --profile pades for PAdES B-T.
  --timestamp-digest      sha256 (default) | sha384 | sha512 (TSA imprint)
  --timestamp-nonce <hex> Request nonce (default: random 8 bytes)
  --timestamp-timeout <ms>
                          Per-request TSA timeout (default: 10000, the
                          guarded transport's default)

Security: key material is never written to logs or error messages. Without
--timestamp the CLI performs no network I/O. Pass --signing-time for a
reproducible signature (RSA PKCS#1 v1.5 is deterministic; ECDSA needs
--pure-crypto for RFC 6979 deterministic nonces).

  --help,    -h   Show this help message
`;

const VERIFY_USAGE = `\
pdfnative verify — Verify CMS/PKCS#7 signatures in a PDF

Usage:
  pdfnative verify [--input <file.pdf>] [--trust <root.pem>]... [--strict]
                   [--revocation offline|online|disabled]
                   [--revocation-policy soft-fail|strict] [--format json|text]

Options:
  --input,   -i        Path to input PDF (default: stdin)
  --trust              PEM file with trusted root certs (repeatable;
                       env: PDFNATIVE_VERIFY_TRUST). When omitted, self-signed
                       roots are accepted.
  --strict             Exit code 1 if any signature fails any check. Also
                       refuses an RFC 3161 timestamp whose messageImprint
                       uses SHA-1 (reported as a "weak digest" note and in
                       timestampDigest otherwise).
  --revocation         Certificate revocation source (default: offline):
                         offline   embedded OCSP/CRL from the PDF /DSS only
                         online    additionally fetch via OCSP (AIA) and CRL
                                   (CDP) URLs — SSRF-guarded, no redirects
                         disabled  skip revocation checking entirely
  --revocation-policy  How revocation affects validity (default: soft-fail):
                         soft-fail  only an explicit "revoked" status fails
                         strict     a non-"good" status fails the signature
  --format,  -f        json (default) or text
  --summary            Emit only the minimal verdict { valid, signatures, invalid }
  --fields             Comma-separated dot-paths to keep (e.g. allValid,signatures.signatureValid)
  --pretty             Force indented JSON even under --json (agent mode is compact)
  --help,    -h        Show this help message

Reported per signature:
  - byte-range integrity (SHA-256 against CMS messageDigest)
  - signer subject / issuer
  - certificate chain validity
  - chain root trust evaluation
  - signature value cryptographic verification (RSA-SHA256 / ECDSA-SHA256)
  - RFC 3161 timestamp token validation (PAdES-T)
  - OCSP (RFC 6960) + CRL (RFC 5280) revocation status

Each signature also reports its form-field name, and /DocTimeStamp revisions
(PAdES B-LTA) are validated as RFC 3161 tokens (isDocTimestamp: true).
Sign-side LTV lives in \`pdfnative sign --timestamp\`, \`pdfnative ltv\` and
\`pdfnative doc-timestamp\`.
`;

const LTV_USAGE = `\
pdfnative ltv — PAdES B-LT: long-term validation data (/DSS + /VRI)

Usage:
  pdfnative ltv collect --input signed.pdf --online [--output ltv.json]
  pdfnative ltv embed   --input signed.pdf --data ltv.json [--output out.pdf]
  pdfnative ltv add     --input signed.pdf --online [--output out.pdf]

Archives the certificates, OCSP responses and CRLs needed to validate the
document's signatures long after certificates expire (PAdES B-LT). The two-step
collect/embed flow supports air-gapped pipelines: collect on a connected
machine, embed offline.

Subcommands:
  collect   Fetch validation data (OCSP/CRL) and write a replayable JSON file
            (schema subject: ltv-data). REQUIRES --online.
  embed     Embed a previously collected JSON into /DSS + /VRI. NEVER performs
            network I/O.
  add       collect + embed in one pass. REQUIRES --online.

Options:
  --input,   -i    Input PDF path (default: stdin)
  --output,  -o    Output path (default: stdout)
  --online         Explicit opt-in for network fetches (SSRF-guarded, no
                   redirects). Without it, collect/add refuse to run — use
                   \`ltv embed\` for the offline half.
  --prefer         ocsp (default) | crl — preferred revocation source
  --extra-cert     PEM file with extra chain certificates (repeatable)
  --data           Collected JSON file (embed mode, required)
  --timeout        Network timeout in ms (default: 10000)
  --dry-run        Validate inputs; no output, no network
  --help,    -h    Show this help message

Typical PAdES ladder:
  sign --timestamp <tsa> --profile pades   →  B-T
  ltv add --online                         →  B-LT
  doc-timestamp --url <tsa>                →  B-LTA
  ltv add --online                         →  LTV for the doc-timestamp itself
`;

const DOC_TIMESTAMP_USAGE = `\
pdfnative doc-timestamp — PAdES B-LTA: RFC 3161 document timestamp

Usage:
  pdfnative doc-timestamp --input signed.pdf --url <tsa-url> [--output out.pdf]

Appends a /DocTimeStamp signature field (SubFilter /ETSI.RFC3161, ISO 32000-2
§12.8.5) covering every byte of the document as an incremental revision —
earlier revisions stay byte-identical. Repeat periodically to renew LTA
protection.

Options:
  --input,   -i        Input PDF path (default: stdin)
  --output,  -o        Output PDF path (default: stdout)
  --url                RFC 3161 TSA URL — REQUIRED (explicit network opt-in;
                       SSRF-guarded, no redirects)
  --digest             sha256 (default) | sha384 | sha512
  --field-name         Timestamp field name (default: DocTimeStamp1, auto-
                       suffixed on collision)
  --placeholder-bytes  /Contents placeholder size (default: 12288)
  --nonce <hex>        Request nonce (default: random)
  --timeout            Network timeout in ms (default: 10000)
  --dry-run            Validate inputs; no output, no network
  --help,    -h        Show this help message
`;

const METADATA_USAGE = `\
pdfnative metadata — Update PDF /Info + XMP metadata

Usage:
  pdfnative metadata --input in.pdf --title "New title" [--output out.pdf]
  pdfnative metadata --input in.pdf --from-json meta.json --output out.pdf

The update is an INCREMENTAL save: the original bytes are preserved as a
prefix, so existing digital signatures remain valid for their revision. The
XMP packet is kept in sync (xmp:ModifyDate, pdf:Keywords, …).

Options:
  --input,   -i   Input PDF path (default: stdin)
  --output,  -o   Output PDF path (default: stdout)
  --title         Document title
  --author        Author
  --subject       Subject
  --keywords      Keywords (single string)
  --mod-date      ISO 8601 modification date (default: now — pass a fixed
                  value for reproducible output)
  --from-json     JSON file { title?, author?, subject?, keywords?, modDate? }
                  (mutually exclusive with the per-field flags)
  --password      Password for an encrypted PDF (env: PDFNATIVE_PASSWORD)
  --dry-run       Validate inputs without writing output
  --help,    -h   Show this help message

At least one metadata field is required. Reading metadata stays in
\`pdfnative inspect\`.
`;

const COMPARE_USAGE = `\
pdfnative compare — Diff two PDFs by text and structure

Usage:
  pdfnative compare a.pdf b.pdf [--mode both] [--format text|json] [options]

Compares extracted reading-order text and/or document structure (page count,
page/print boxes, metadata, form fields, annotations, encryption, signatures).
Built for CI and agents: identical documents exit 0; any difference exits 1
with the stable code E_CHECK_FAILED. Visual/rasterised diffing is out of scope
(pdfnative has no rasteriser).

Options:
  --mode               text | structure | both (default: both)
  --format,  -f        text (default) or json (report on stdout)
  --tolerance <pt>     Geometric tolerance in points for page/box sizes
                       (default: 0)
  --ignore-whitespace  Collapse runs of whitespace before the text diff
  --pages              1-based selector limiting the text diff (e.g. "1,3-5")
  --password-a         Password for the first PDF
  --password-b         Password for the second PDF
  --pretty             Force indented JSON even under --json
  --help,    -h        Show this help message
`;

const INSPECT_USAGE = `\
pdfnative inspect — Analyse a PDF and output metadata

Usage:
  pdfnative inspect [--input <file.pdf>] [--format <fmt>] [options]

Options:
  --input,   -i   Path to input PDF (default: stdin)
  --format,  -f   json (default) or text
  --verbose,  -v  Include trailerKeys, catalogKeys, objectCount,
                  XMP metadata length
  --pages         Per-page width/height/rotation/annotation/formField counts
  --annotations   List markup / link annotations (page, subtype, contents/url)
  --form-fields   List AcroForm fields (name, type, value, required/read-only)
  --encryption    Report the encryption scheme (algorithm, revision, opened-as)
  --password      Password for an encrypted PDF (env: PDFNATIVE_PASSWORD)
  --pdfua         Include a PDF/UA (ISO 14289-1) structural validation report
                  (valid + errors + warnings)
  --pdfx          Include a PDF/X-4 (ISO 15930-7) structural validation report
                  from pdfnative's validatePdfX(): header, XMP identification,
                  OutputIntent profile, page boxes, embedded fonts, annotations,
                  actions, embedded files, OPI/PostScript XObjects, LZW,
                  transfer functions, device colour. Not a certified preflight
                  (veraPDF does not cover PDF/X).
  --iso-dates     Normalise metadata.creationDate from the PDF date string
                  (D:YYYYMMDDHHmmSS+HH'mm') to ISO 8601
  --signatures    List signature fields (fieldName, subFilter, byteRange,
                  isDocTimestamp, isPlaceholder — never the signature bytes)
  --check         Assert a property; repeatable; AND semantics; exits 1 on
                  failure. Values: pdfa | signed | encrypted | pdfua | pdfx |
                  "signatures>=N"
  --summary       Emit only the minimal verdict { pages, encrypted, signatures, pdfa, pdfx }
  --fields        Comma-separated dot-paths to keep (e.g. pageCount,metadata.title)
  --pretty        Force indented JSON even under --json (agent mode is compact)
  --help,    -h   Show this help message
`;

const BATCH_USAGE = `\
pdfnative batch — Render a directory, or run a multi-command manifest pipeline

Usage:
  pdfnative batch --input-dir <dir> --output-dir <dir> [render options]
  pdfnative batch --manifest tasks.json [--allow-network] [--continue-on-error]

Directory mode:
  --input-dir        Directory of *.json document definitions (required)
  --output-dir       Directory for the rendered *.pdf files (created if absent)
  --concurrency      Maximum parallel renders (default: 4)
  --fail-fast        Stop at the first failure (default: render all, then report)

Manifest mode (mutually exclusive with --input-dir):
  --manifest         Declarative pipeline file (schema subject: batch-manifest):
                     { "version": 1, "tasks": [ { "id", "command", "flags" } ] }
                     Flag values "@<id>" reference the output of an EARLIER
                     task; relative paths resolve against the manifest's
                     directory. Tasks run sequentially, fail-fast.
                     Allowed commands: render, sign, verify, inspect, merge,
                     split, extract, extract-text, fill, encrypt, decrypt,
                     annotate, metadata, doc-timestamp. (ltv and compare need
                     positional arguments and are not yet manifest-callable.)
  --allow-network    Required for any network flag inside the manifest
                     (--timestamp, --url, --online, --revocation online). An
                     untrusted manifest can never trigger network I/O on its
                     own.
  --continue-on-error
                     Keep running after a failure; tasks depending (via @) on a
                     failed task are skipped.

Common:
  --format,  -f      Summary format: text (default) or json
  --summary          Emit only the minimal verdict { total, succeeded, failed }
  --fields           Comma-separated dot-paths to keep (e.g. total,failed)
  --pretty           Force indented JSON even under --json (agent mode is compact)
  --dry-run          Validate the manifest / inputs without executing
  --help,    -h      Show this help message

In directory mode all other flags (--variant, --layout, --page-size, --tagged,
--compress, smart-table flags, …) are forwarded to each render. Exit code 1 if
any file or task fails.
`;

const MERGE_USAGE = `\
pdfnative merge — Concatenate multiple PDFs into one

Usage:
  pdfnative merge <in1.pdf> <in2.pdf> [...] [--output <out.pdf>] [options]
  pdfnative merge --input a.pdf --input b.pdf --output out.pdf

Inputs are given as positional paths and/or repeated --input flags (2–50
sources, applied in order). Output defaults to stdout.

Options:
  --output,  -o         Output PDF path (default: stdout)
  --drop-annotations    Drop ALL annotations (default keeps self-contained URI
                        links; cross-page GoTo links and widgets are always
                        dropped)
  --max-output-size     Max assembled size in bytes (default 256 MiB; 0/none to
                        disable the OOM guard — not recommended for untrusted
                        input)
  --password            Password for encrypted source PDFs (env: PDFNATIVE_PASSWORD).
                        A SINGLE password is applied to EVERY source; merging
                        encrypted sources that use different passwords fails
                        (E_PASSWORD).
  --encrypt [aes-128|aes-256]
                        Re-encrypt the output (bare = aes-128). Needs
                        --owner-password
  --owner-password      Owner password for --encrypt (env: PDFNATIVE_ENCRYPT_OWNER_PASS)
  --user-password       User password for --encrypt (env: PDFNATIVE_ENCRYPT_USER_PASS)
  --permissions         Comma-separated: print, copy, modify, extract
  --stream              Constant-memory streaming output (--chunk-size N bytes)
  --dry-run             Validate + read all sources without writing output
  --help,    -h         Show this help message

Note: the page-tree rebuild drops signatures and form fields (any page-tree
edit invalidates a signature's /ByteRange). Encrypted sources are supported
via --password (pdfnative 1.6.0).
`;

const SPLIT_USAGE = `\
pdfnative split — Split one PDF into multiple PDFs

Usage:
  pdfnative split --input in.pdf --output-dir out/ [--pages "1-3,4-6,7"]

With --pages, each comma-separated segment becomes one output document; without
it, every page becomes its own single-page PDF.

Options:
  --input,   -i         Input PDF path (default: stdin)
  --output-dir          Directory for the output PDFs (created if absent, required)
  --pages               1-based selector, one output per segment (e.g. "1-3,4-6,7")
  --prefix              Output filename prefix (default: input basename or "part")
  --drop-annotations    Drop ALL annotations (see merge)
  --max-output-size     Max size per emitted PDF in bytes (default 256 MiB)
  --password            Password for an encrypted source (env: PDFNATIVE_PASSWORD)
  --encrypt [aes-128|aes-256]
                        Re-encrypt each output (needs --owner-password)
  --owner-password      Owner password for --encrypt (env: PDFNATIVE_ENCRYPT_OWNER_PASS)
  --user-password       User password for --encrypt (env: PDFNATIVE_ENCRYPT_USER_PASS)
  --permissions         Comma-separated: print, copy, modify, extract
  --stream              Constant-memory streaming output (--chunk-size N bytes)
  --dry-run             Validate without writing output
  --help,    -h         Show this help message

Output files are named <prefix>-<n>.pdf (zero-padded). Signatures/forms are
dropped; encrypted sources are supported via --password.
`;

const EXTRACT_USAGE = `\
pdfnative extract — Extract selected pages into a new PDF

Usage:
  pdfnative extract --input in.pdf --pages "1,3,5-7" [--output out.pdf]

Options:
  --input,   -i         Input PDF path (default: stdin)
  --output,  -o         Output PDF path (default: stdout)
  --pages               1-based selector (required). Order is preserved and
                        pages may repeat, e.g. "3,1,1,5-7"
  --drop-annotations    Drop ALL annotations (see merge)
  --max-output-size     Max assembled size in bytes (default 256 MiB)
  --password            Password for an encrypted source (env: PDFNATIVE_PASSWORD)
  --encrypt [aes-128|aes-256]
                        Re-encrypt the output (needs --owner-password)
  --owner-password      Owner password for --encrypt (env: PDFNATIVE_ENCRYPT_OWNER_PASS)
  --user-password       User password for --encrypt (env: PDFNATIVE_ENCRYPT_USER_PASS)
  --permissions         Comma-separated: print, copy, modify, extract
  --stream              Constant-memory streaming output (--chunk-size N bytes)
  --dry-run             Validate without writing output
  --help,    -h         Show this help message

Signatures/forms are dropped; encrypted sources are supported via --password.
`;

const EXTRACT_TEXT_USAGE = `\
pdfnative extract-text — Extract reading-order Unicode text from a PDF

Usage:
  pdfnative extract-text --input in.pdf [--format text|json|ndjson] [options]

Built for agents / RAG: emits per-page text in reading order. No OCR —
image-only pages yield empty text.

Options:
  --input,   -i   Input PDF path (default: stdin)
  --format,  -f   text (default) | json | ndjson (one JSON object per page)
  --pages         1-based selector to limit pages (e.g. "1,3,5-7")
  --runs          Include positioned text runs { text, x, y, fontSize, fontName }
  --password      Password for an encrypted PDF (env: PDFNATIVE_PASSWORD)
  --max-length    Hard cap on total characters (default 16000000; 0/none off)
  --summary       (json) Emit only { pages, characters }
  --fields        (json) Comma-separated dot-paths to keep
  --pretty        Force indented JSON even under --json
  --help,    -h   Show this help message

In text mode, pages are separated by a form-feed (\\f) character.
`;

const FILL_USAGE = `\
pdfnative fill — Fill and/or flatten an AcroForm PDF

Usage:
  pdfnative fill --input form.pdf --data values.json [--output out.pdf] [--flatten]
  pdfnative fill --input form.pdf --flatten --output flat.pdf
  pdfnative fill --input form.pdf --export [--output values.json]

--data is a JSON object mapping fully-qualified field name → value (string,
boolean, or string[] for multi-select listboxes), or { "values": { … } }.
Discover field names with \`pdfnative inspect --form-fields\`, or dump the current
values as a ready-to-edit --data map with --export (read → edit → fill).

Options:
  --input,   -i        Input PDF path (default: stdin)
  --output,  -o        Output PDF / values path (default: stdout)
  --data               Path to the values JSON (required unless --flatten/--export)
  --flatten            Also flatten after filling (or flatten existing values
                       when --data is omitted)
  --export             Read-only: emit current field values as a --data-shaped
                       JSON map (ignores --data/--flatten)
  --force              Flatten even if a signed signature field is present
  --on-unknown         Behaviour for unknown field names: throw (default)|ignore
  --need-appearances   Allow non-WinAnsi values by setting /NeedAppearances
  --password           Password for an encrypted PDF (env: PDFNATIVE_PASSWORD)
  --dry-run            Validate + enumerate fields without writing output
  --help,    -h        Show this help message

The update is incremental, so an existing signature stays valid for its
revision. Signature fields cannot be filled.
`;

const ENCRYPT_USAGE = `\
pdfnative encrypt — Re-secure a PDF with AES-128/256 encryption

Usage:
  pdfnative encrypt --input in.pdf --owner-password <pass> [--output out.pdf]

Rebuilds the document from its page tree (like merge), so signatures and form
fields are dropped. Requires a Web Crypto CSPRNG; RC4 is never emitted.

Options:
  --input,   -i        Input PDF path (default: stdin)
  --output,  -o        Output PDF path (default: stdout)
  --owner-password     Owner password — REQUIRED (env: PDFNATIVE_ENCRYPT_OWNER_PASS)
  --user-password      User (open) password (env: PDFNATIVE_ENCRYPT_USER_PASS)
  --algorithm          aes-128 (default) | aes-256
  --permissions        Comma-separated: print, copy, modify, extract
  --password           Open an already-encrypted source (password rotation;
                       env: PDFNATIVE_PASSWORD)
  --drop-annotations   Drop ALL annotations (default keeps URI links)
  --max-output-size    Max assembled size in bytes (default 256 MiB)
  --stream             Constant-memory streaming output (--chunk-size N bytes)
  --dry-run            Validate without writing output
  --help,    -h        Show this help message

Passwords are read from env (winning over flags) and never logged.
`;

const DECRYPT_USAGE = `\
pdfnative decrypt — Remove encryption from a PDF

Usage:
  pdfnative decrypt --input enc.pdf --password <pass> [--output out.pdf]

Emits a plaintext copy. Rebuilds the page tree (like merge), so signatures and
form fields are dropped.

Options:
  --input,   -i        Input PDF path (default: stdin)
  --output,  -o        Output PDF path (default: stdout)
  --password           Document password (env: PDFNATIVE_PASSWORD)
  --drop-annotations   Drop ALL annotations (default keeps URI links)
  --max-output-size    Max assembled size in bytes (default 256 MiB)
  --stream             Constant-memory streaming output (--chunk-size N bytes)
  --dry-run            Validate without writing output
  --help,    -h        Show this help message
`;

const DOCTOR_USAGE = `\
pdfnative doctor — Environment / capability preflight

Usage:
  pdfnative doctor [--format json|text] [--json]

Reports the CLI version, Node version, Web Crypto (CSPRNG) availability — which
\`encrypt\` requires — the resolved pdfnative version, the registered command
count, the bundled font inventory (31 modules / 27 scripts, each probed on
disk), the Universal Shaping Engine's Unicode version and the conformance
targets (--tagged / --pdfx). Fully offline. Exit code 0 when all checks pass,
1 otherwise.

Options:
  --format,  -f   text (default) or json
  --json          Global agent mode also selects JSON output
  --pretty        Force indented JSON even under --json
  --help,    -h   Show this help message
`;

const ANNOTATE_USAGE = `\
pdfnative annotate — Attach markup annotations to a PDF

Usage:
  pdfnative annotate --input in.pdf --annotations notes.json [--output out.pdf]

The annotations file is a JSON array (or { "annotations": [...] }). Each entry
is a markup annotation plus a 1-based "page":

  [
    { "page": 1, "type": "highlight", "rect": [72,700,520,716],
      "color": "#ffd400", "contents": "Review this" },
    { "page": 1, "type": "text", "rect": [540,700,560,720],
      "icon": "Comment", "contents": "A sticky note" },
    { "page": 2, "type": "link", "rect": [72,80,300,96],
      "url": "https://pdfnative.dev" }
  ]

Types: text, highlight, underline, strikeout, squiggly, square, circle, line,
freetext, link. All need "rect": [x1,y1,x2,y2]; "line" also needs
"start"/"end"; "link" needs "url" (http:, https: or mailto: only — other
schemes and control characters are rejected, E_INPUT). Colours accept hex,
"r g b", or CMYK "c m y k" / [c,m,y,k].

Options:
  --input,   -i         Input PDF path (default: stdin)
  --output,  -o         Output PDF path (default: stdout)
  --annotations         Path to the annotations JSON (required)
  --password            Password for an encrypted PDF (env: PDFNATIVE_PASSWORD)
  --dry-run             Validate inputs without writing output
  --help,    -h         Show this help message

The document is updated with an incremental save, so the original bytes — and
any existing signature — are preserved. Encrypted PDFs are supported via
--password (appended objects are encrypted under the existing scheme).
`;

const GOVERN_USAGE = `\
pdfnative govern — AI-governance / Human-in-the-Loop (HITL) contract

Usage:
  pdfnative govern rules                 Print the human/agent protocol
  pdfnative govern policy                Print the machine-readable policy (JSON)
  pdfnative govern verify-issue <draft>  Validate an issue/PR draft

pdfnative's governance model makes AI agents DRAFTSMEN, never autonomous
submitters: no runtime dependencies, a local reproduction for every bug, and a
mandatory human review before anything is submitted under a human identity.

verify-issue exits 1 when the draft proposes an external dependency or omits a
reproduction code block. A passing check is necessary but NOT sufficient — the
human review gate always applies.

Options (verify-issue):
  --input,   -i   Draft path (alternative to the positional argument; stdin if -)
  --format,  -f   json (report on stdout) or text (default)
  --pretty        Force indented JSON even under --json
  --help,    -h   Show this help message
`;

const SCHEMA_USAGE = `\
pdfnative schema — Print a JSON Schema for a CLI input/output shape

Usage:
  pdfnative schema [subject]

Subjects:
  render          Input for \`render\` (document or table variant) — default
  inspect         Output of \`inspect --format json\`
  verify          Output of \`verify --format json\`
  batch           Output of \`batch --format json\`
  annotate        Input for \`annotate\` (--annotations JSON)
  extract-text    Output of \`extract-text --format json\`
  fill            Input for \`fill\` (--data JSON)
  form-export     Output of \`fill --export\`
  inspect-summary Output of \`inspect --summary\`
  verify-summary  Output of \`verify --summary\`
  batch-summary   Output of \`batch --summary\`
  govern-verify   Output of \`govern verify-issue --format json\`
  metadata        Input for \`metadata --from-json\`
  ltv-data        Output of \`ltv collect\` / input for \`ltv embed\`
  compare         Output of \`compare --format json\`
  batch-manifest  Input for \`batch --manifest\`
  status          Agent success envelope (write commands, --json)
  manifest        Machine-readable capability manifest (commands, flags, codes)
  doctor          Output of \`doctor --format json\`
  list            Print the available subjects as JSON

With no subject, the \`render\` input schema is printed. Schemas are JSON Schema
Draft 2020-12 and carry a versioned \\$id, so agents can self-validate input
before invoking the CLI.
`;

const COMPLETION_USAGE = `\
pdfnative completion — Emit a shell completion script

Usage:
  pdfnative completion <bash|zsh|fish|powershell>

Install (examples):
  pdfnative completion bash > /etc/bash_completion.d/pdfnative
  pdfnative completion zsh  > "\${fpath[1]}/_pdfnative"
  pdfnative completion fish > ~/.config/fish/completions/pdfnative.fish
  pdfnative completion powershell >> $PROFILE
`;

async function loadCommand(name: string): Promise<CommandFn> {
    switch (name) {
        case 'render': {
            const m = await import('./commands/render.js');
            return m.render;
        }
        case 'sign': {
            const m = await import('./commands/sign.js');
            return m.sign;
        }
        case 'verify': {
            const m = await import('./commands/verify.js');
            return m.verify;
        }
        case 'inspect': {
            const m = await import('./commands/inspect.js');
            return m.inspect;
        }
        case 'merge': {
            const m = await import('./commands/merge.js');
            return m.merge;
        }
        case 'split': {
            const m = await import('./commands/split.js');
            return m.split;
        }
        case 'extract': {
            const m = await import('./commands/extract.js');
            return m.extract;
        }
        case 'extract-text': {
            const m = await import('./commands/extract-text.js');
            return m.extractTextCmd;
        }
        case 'fill': {
            const m = await import('./commands/fill.js');
            return m.fill;
        }
        case 'encrypt': {
            const m = await import('./commands/encrypt.js');
            return m.encrypt;
        }
        case 'decrypt': {
            const m = await import('./commands/decrypt.js');
            return m.decrypt;
        }
        case 'annotate': {
            const m = await import('./commands/annotate.js');
            return m.annotate;
        }
        case 'metadata': {
            const m = await import('./commands/metadata.js');
            return m.metadata;
        }
        case 'compare': {
            const m = await import('./commands/compare.js');
            return m.compare;
        }
        case 'ltv': {
            const m = await import('./commands/ltv.js');
            return m.ltv;
        }
        case 'doc-timestamp': {
            const m = await import('./commands/docTimestamp.js');
            return m.docTimestamp;
        }
        case 'govern': {
            const m = await import('./commands/govern.js');
            return m.govern;
        }
        case 'batch': {
            const m = await import('./commands/batch.js');
            return m.batch;
        }
        case 'completion': {
            const m = await import('./commands/completion.js');
            return m.completion;
        }
        case 'schema': {
            const m = await import('./commands/schema.js');
            return m.schema;
        }
        case 'doctor': {
            const m = await import('./commands/doctor.js');
            return m.doctor;
        }
        default:
            return Promise.reject(
                new CliError(`Unknown command: ${name}. Run pdfnative --help for usage.`, 1),
            );
    }
}

// The command being dispatched, captured for the agent JSON error envelope.
let activeCommand: string | null = null;

async function main(): Promise<void> {
    const argv = process.argv.slice(2);
    // The boolean globals never swallow the next token, so they may precede
    // the command name (`pdfnative --json render …`, v1.5.0).
    const args = parseArgs(argv, { booleanFlags: GLOBAL_BOOLEAN_FLAGS });

    // Global output flags (recognised anywhere in argv).
    if (hasFlag(args.flags, 'no-color') || process.env['NO_COLOR'] !== undefined) {
        process.env['NO_COLOR'] = '1';
    }
    if (hasFlag(args.flags, 'quiet', 'q')) {
        process.env['PDFNATIVE_QUIET'] = '1';
    }
    if (hasFlag(args.flags, 'json')) {
        process.env['PDFNATIVE_JSON'] = '1';
    }
    if (hasFlag(args.flags, 'dry-run')) {
        process.env['PDFNATIVE_DRY_RUN'] = '1';
    }

    // Global inflate cap for parsing untrusted PDFs (anti zip-bomb). Applied
    // before dispatch so every reading command inherits it. Dynamic import
    // keeps --help / --version startup free of the pdfnative module cost.
    const maxInflate = getStringFlag(args.flags, 'max-inflate-size');
    if (maxInflate !== undefined) {
        const n = Number(maxInflate);
        if (!Number.isInteger(n) || n <= 0) {
            throw new CliError('--max-inflate-size expects a positive integer byte count', 2);
        }
        const bridge = await import('./core-bridge/index.js');
        bridge.setMaxInflateOutputSize(n);
    }

    if (hasFlag(args.flags, 'help', 'h') && args.positionals.length === 0) {
        process.stdout.write(USAGE);
        process.exit(0);
    }

    if (hasFlag(args.flags, 'version', 'V')) {
        const version = cliVersion();
        if (hasFlag(args.flags, 'json')) {
            process.stdout.write(JSON.stringify({ name: 'pdfnative-cli', version }) + '\n');
        } else {
            process.stdout.write(version + '\n');
        }
        process.exit(0);
    }

    const { commandName, commandArgv } = splitCommandArgv(argv);

    if (commandName === undefined) {
        process.stdout.write(USAGE);
        process.exit(0);
    }

    activeCommand = commandName;

    if (hasFlag(args.flags, 'help', 'h')) {
        switch (commandName) {
            case 'render': process.stdout.write(RENDER_USAGE); break;
            case 'sign':   process.stdout.write(SIGN_USAGE);   break;
            case 'verify': process.stdout.write(VERIFY_USAGE); break;
            case 'inspect': process.stdout.write(INSPECT_USAGE); break;
            case 'merge': process.stdout.write(MERGE_USAGE); break;
            case 'split': process.stdout.write(SPLIT_USAGE); break;
            case 'extract': process.stdout.write(EXTRACT_USAGE); break;
            case 'extract-text': process.stdout.write(EXTRACT_TEXT_USAGE); break;
            case 'fill': process.stdout.write(FILL_USAGE); break;
            case 'encrypt': process.stdout.write(ENCRYPT_USAGE); break;
            case 'decrypt': process.stdout.write(DECRYPT_USAGE); break;
            case 'annotate': process.stdout.write(ANNOTATE_USAGE); break;
            case 'metadata': process.stdout.write(METADATA_USAGE); break;
            case 'compare': process.stdout.write(COMPARE_USAGE); break;
            case 'ltv': process.stdout.write(LTV_USAGE); break;
            case 'doc-timestamp': process.stdout.write(DOC_TIMESTAMP_USAGE); break;
            case 'govern': process.stdout.write(GOVERN_USAGE); break;
            case 'batch': process.stdout.write(BATCH_USAGE); break;
            case 'schema': process.stdout.write(SCHEMA_USAGE); break;
            case 'completion': process.stdout.write(COMPLETION_USAGE); break;
            case 'doctor': process.stdout.write(DOCTOR_USAGE); break;
            default:
                process.stderr.write(`Unknown command: ${commandName}. Run pdfnative --help for usage.\n`);
                process.exit(1);
        }
        process.exit(0);
    }

    const commandArgs = parseArgs(commandArgv, { booleanFlags: GLOBAL_BOOLEAN_FLAGS });

    // Apply `.pdfnativerc.json` defaults (unless --no-config). CLI flags win.
    let effectiveArgs = commandArgs;
    if (!hasFlag(commandArgs.flags, 'no-config')) {
        const configPath = getStringFlag(commandArgs.flags, 'config');
        const defaults = loadConfig(commandName, configPath);
        effectiveArgs = applyConfigDefaults(commandArgs, defaults);
    }

    // Reproducible output (v1.5.0): --creation-date / SOURCE_DATE_EPOCH pin
    // the creation instant process-wide, so every render in this run — a
    // `batch --manifest` pipeline included — stamps the same date. Resolved
    // after the config merge so a .pdfnativerc.json can supply it too.
    const pinned = resolveReproducibleDate(effectiveArgs.flags);
    if (pinned !== undefined) {
        const bridge = await import('./core-bridge/index.js');
        bridge.setDefaultCreationDate(pinned.date);
    }

    const command = await loadCommand(commandName);
    await command(effectiveArgs);
}

main().catch((e: unknown) => {
    // Agent mode: a single JSON error envelope on stderr, with a stable code.
    if (isJsonMode()) {
        emitJsonError(activeCommand, e);
        if (process.env['PDFNATIVE_DEBUG'] === '1' && e instanceof Error) {
            process.stderr.write((e.stack ?? e.message) + '\n');
        }
        process.exit(e instanceof CliError ? e.exitCode : 1);
    }
    if (e instanceof CliError) {
        if (e.message.length > 0) {
            process.stderr.write(e.message + '\n');
        }
        process.exit(e.exitCode);
    }
    const message = e instanceof Error ? e.message : String(e);
    if (process.env['PDFNATIVE_DEBUG'] === '1' && e instanceof Error) {
        process.stderr.write((e.stack ?? e.message) + '\n');
    }
    process.stderr.write(`Error: ${message}\n`);
    process.exit(1);
});
