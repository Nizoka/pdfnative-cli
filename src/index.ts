import { createRequire } from 'node:module';
import { parseArgs, hasFlag, getStringFlag } from './utils/args.js';
import { CliError } from './utils/error.js';
import { isJsonMode, emitJsonError } from './utils/agent.js';
import { loadConfig, applyConfigDefaults } from './utils/config.js';

// Lazy-import commands to keep startup fast for --help / --version
type CommandFn = (args: ReturnType<typeof parseArgs>) => Promise<void>;

const USAGE = `\
pdfnative-cli — Official CLI for pdfnative

Usage:
  pdfnative <command> [options]

Commands:
  render    Render a JSON document definition to PDF
  sign      Apply a digital signature to a PDF
  verify    Verify embedded PDF signatures
  inspect   Analyse a PDF and output metadata / conformance info
  batch     Render every JSON file in a directory to PDF (parallel)
  schema    Print a JSON Schema for a CLI input/output shape
  completion  Emit a shell completion script (bash|zsh|fish)

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
  --dry-run         Validate inputs and exit without writing output
                    (render, sign, batch).

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
  --watermark-opacity    0.0–1.0 (default 0.2)
  --watermark-rotation   degrees (default 45)

Encryption (mutually exclusive with --tagged pdfa*):
  --encrypt              aes-128 | aes-256
  --owner-password       (or env $PDFNATIVE_ENCRYPT_OWNER_PASS — env wins)
  --user-password        (or env $PDFNATIVE_ENCRYPT_USER_PASS — env wins)
  --permissions          Comma-separated: print,copy,modify,annotate,form,
                         accessibility,assemble,print-hi-res

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
  --pdfua         Include a PDF/UA (ISO 14289-1) structural validation report
                  (valid + errors + warnings)
  --check         Assert a property; repeatable; AND semantics; exits 1 on
                  failure. Values: pdfa | signed | encrypted | pdfua
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
  --help,    -h      Show this help message

All other flags (--variant, --layout, --page-size, --tagged, --compress,
smart-table flags, …) are forwarded to each render. Per-file --input/--output
are managed automatically. Exit code 1 if any file fails.
`;

const SCHEMA_USAGE = `\
pdfnative schema — Print a JSON Schema for a CLI input/output shape

Usage:
  pdfnative schema [subject]

Subjects:
  render        Input for \`render\` (document or table variant) — default
  inspect       Output of \`inspect --format json\`
  verify        Output of \`verify --format json\`
  batch         Output of \`batch --format json\`
  list          Print the available subjects as JSON

With no subject, the \`render\` input schema is printed. Schemas are JSON Schema
Draft 2020-12 and carry a versioned \\$id, so agents can self-validate input
before invoking the CLI.
`;

const COMPLETION_USAGE = `\
pdfnative completion — Emit a shell completion script

Usage:
  pdfnative completion <bash|zsh|fish>

Install (examples):
  pdfnative completion bash > /etc/bash_completion.d/pdfnative
  pdfnative completion zsh  > "\${fpath[1]}/_pdfnative"
  pdfnative completion fish > ~/.config/fish/completions/pdfnative.fish
`;

function getVersion(): string {
    const require = createRequire(import.meta.url);
    const pkg = require('../package.json') as { version: string };
    return pkg.version;
}

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
        const version = getVersion();
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
            case 'batch': process.stdout.write(BATCH_USAGE); break;
            case 'schema': process.stdout.write(SCHEMA_USAGE); break;
            case 'completion': process.stdout.write(COMPLETION_USAGE); break;
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
