import { parseArgs, hasFlag, getStringFlag } from './utils/args.js';
import { CliError } from './utils/error.js';
import { isJsonMode, emitJsonError } from './utils/agent.js';
import { loadConfig, applyConfigDefaults } from './utils/config.js';
import { cliVersion } from './utils/version.js';

// Lazy-import commands to keep startup fast for --help / --version
type CommandFn = (args: ReturnType<typeof parseArgs>) => Promise<void>;

const USAGE = `\
pdfnative-cli — Official CLI for pdfnative

Usage:
  pdfnative <command> [options]

Commands (17):

 Create & edit
  render      Render a JSON document definition to PDF
  fill        Fill / flatten / export an AcroForm PDF
  annotate    Attach markup annotations to a PDF

 Page tree
  merge       Concatenate multiple PDFs into one
  split       Split a PDF into multiple PDFs (per page or range)
  extract     Extract selected pages into a new PDF

 Security
  sign        Apply a digital signature to a PDF
  verify      Verify embedded PDF signatures
  encrypt     Re-secure a PDF with AES-128/256 encryption
  decrypt     Remove encryption from a PDF (with --password)

 Read & extract
  inspect     Analyse a PDF (metadata, conformance, form fields, encryption)
  extract-text  Extract reading-order text (text | json | ndjson)

 Automation & meta
  batch       Render every JSON file in a directory to PDF (parallel)
  doctor      Environment / capability preflight (text or --json)
  schema      Print a JSON Schema / capability manifest for agents
  completion  Emit a shell completion script (bash|zsh|fish|powershell)
  govern      AI-governance / HITL contract (rules, policy, verify-issue)

Options:
  --help,    -h   Show this help message
  --version, -V   Show version (add --json for machine-readable output)

Global options (any command):
  --config <file>   Use a specific .pdfnativerc.json (default: nearest upward)
  --no-config       Ignore any .pdfnativerc.json
  --quiet,   -q     Suppress progress output on stderr
  --no-color        Disable ANSI colour (also respects NO_COLOR)
  --json            Agent mode: emit a JSON status/error envelope on stderr
                    (data stays on stdout). Errors carry a stable code.
  --dry-run         Validate inputs and exit without writing output (render,
                    sign, batch, merge, split, extract, annotate, fill,
                    encrypt, decrypt).

For autonomous/agent usage see AGENTS.md.
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
  --watch         Re-render on input file change (requires --input and a
                  file --output; logs to stderr; debounce 200 ms).
  --template      Path to JSON template file. Stdin / --input is deep-merged
                  on top (caller wins; arrays replace).

Variant:
  --variant       document (default) or table

Smart tables (document variant; fills TableBlock fields left unset in JSON):
  --table-wrap        auto (default) | always | never
  --repeat-header     [true|false] repeat header row on continuation pages
  --zebra             [true|false|"R G B"] alternate-row striping
  --min-row-height    Minimum row height in points
  --cell-padding      Horizontal cell padding in points
                  (caption is per-table — set it in the JSON TableBlock)

Layout (flags override values from --layout file):
  --layout        Path to JSON layout file (PdfLayoutOptions)
  --page-size     Named (a4|letter|legal|a3|tabloid|a5) or WxH in points
  --margin        Uniform N or "top,right,bottom,left" in points
  --tagged        none|pdfa1b|pdfa2b|pdfa2u|pdfa3b (PDF/A flag)
  --conformance   DEPRECATED — alias for --tagged pdfa{1b|2b|3b}
  --compress      Enable Flate compression (initialises Node compression)
  --max-blocks    Max document blocks before pdfnative aborts (default 100000)
  --lang          Comma-separated language packs (e.g. th,ja,ar,te,si,km)
  --font          Register a bundled font shortcut (repeatable). The name
                  doubles as the --lang code. Allowed: latin, emoji,
                  color-emoji, and the 22 script codes ar, hy, bn, ru, hi, am,
                  ka, el, he, ja, km, ko, my, pl, zh, si, ta, te, th, bo, tr,
                  vi.

Header / Footer:
  --header-left, --header-center, --header-right
  --footer-left, --footer-center, --footer-right
                  Each accepts a template string. {page}, {pages}, {date} are
                  substituted by pdfnative.

Watermark:
  --watermark-text       Text watermark
  --watermark-image      Image path (PNG/JPEG)
  --watermark-opacity    0.0–1.0
  --watermark-angle      degrees (text watermark)
  --watermark-color      PdfColor (hex "#rrggbb", "r g b", …)
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

Long-term validation (LTV):
  --timestamp <url>  RFC 3161 TSA URL for PAdES-T timestamping. NOT YET
                     available — embedding a timestamp token at signing time
                     requires upstream pdfnative support; the flag is reserved
                     and currently errors. Timestamp VALIDATION already works
                     via \`pdfnative verify\`.

Security: key material is never written to logs or error messages.

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
  --strict             Exit code 1 if any signature fails any check.
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
  --fields             Comma-separated dot-paths to keep (e.g. valid,signatures.signatureValid)
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

Note: sign-side LTV (embedding timestamps / DSS into signatures) is tracked
upstream in pdfnative and is out of scope for this CLI.
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
  --check         Assert a property; repeatable; AND semantics; exits 1 on
                  failure. Values: pdfa | signed | encrypted | pdfua
  --summary       Emit only the minimal verdict { pages, encrypted, signatures, pdfa }
  --fields        Comma-separated dot-paths to keep (e.g. pageCount,metadata.title)
  --pretty        Force indented JSON even under --json (agent mode is compact)
  --help,    -h   Show this help message
`;

const BATCH_USAGE = `\
pdfnative batch — Render every JSON file in a directory to PDF

Usage:
  pdfnative batch --input-dir <dir> --output-dir <dir> [render options]

Options:
  --input-dir        Directory of *.json document definitions (required)
  --output-dir       Directory for the rendered *.pdf files (created if absent)
  --concurrency      Maximum parallel renders (default: 4)
  --fail-fast        Stop at the first failure (default: render all, then report)
  --format,  -f      Summary format: text (default) or json
  --summary          Emit only the minimal verdict { total, succeeded, failed }
  --fields           Comma-separated dot-paths to keep (e.g. total,failed)
  --pretty           Force indented JSON even under --json (agent mode is compact)
  --help,    -h      Show this help message

All other flags (--variant, --layout, --page-size, --tagged, --compress,
smart-table flags, …) are forwarded to each render. Per-file --input/--output
are managed automatically. Exit code 1 if any file fails.
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
\`encrypt\` requires — the resolved pdfnative version, and the registered command
count. Fully offline. Exit code 0 when all checks pass, 1 otherwise.

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
      "icon": "Comment", "contents": "A sticky note" }
  ]

Types: text, highlight, underline, strikeout, squiggly, square, circle, line,
freetext. All need "rect": [x1,y1,x2,y2]; "line" also needs "start"/"end".

Options:
  --input,   -i         Input PDF path (default: stdin)
  --output,  -o         Output PDF path (default: stdout)
  --annotations         Path to the annotations JSON (required)
  --dry-run             Validate inputs without writing output
  --help,    -h         Show this help message

The document is updated with an incremental save, so the original bytes — and
any existing signature — are preserved.
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
    const args = parseArgs(argv);

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

    const commandName = args.positionals[0];

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

    // Strip ONLY the first occurrence of the command name from argv.
    let stripped = false;
    const rest = argv.filter((tok) => {
        if (!stripped && tok === commandName) {
            stripped = true;
            return false;
        }
        return true;
    });

    const commandArgs = parseArgs(rest);

    // Apply `.pdfnativerc.json` defaults (unless --no-config). CLI flags win.
    let effectiveArgs = commandArgs;
    if (!hasFlag(commandArgs.flags, 'no-config')) {
        const configPath = getStringFlag(commandArgs.flags, 'config');
        const defaults = loadConfig(commandName, configPath);
        effectiveArgs = applyConfigDefaults(commandArgs, defaults);
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
