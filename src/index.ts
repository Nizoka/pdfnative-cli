import { createRequire } from 'node:module';
import { parseArgs, hasFlag } from './utils/args.js';
import { CliError } from './utils/error.js';

// Lazy-import commands to keep startup fast for --help / --version
type CommandFn = (args: ReturnType<typeof parseArgs>) => Promise<void>;

const USAGE = `\
pdfnative-cli — Official CLI for pdfnative

Usage:
  pdfnative <command> [options]

Commands:
  render    Render a JSON document definition to PDF
  sign      Apply a digital signature to an existing PDF
  inspect   Analyse a PDF and output metadata / conformance info

Options:
  --help, -h      Show this help message
  --version, -V   Show version

Run \`pdfnative <command> --help\` for per-command options.
`;

const RENDER_USAGE = `\
pdfnative render — Render a JSON DocumentParams to PDF

Usage:
  pdfnative render [--input <file.json>] [--output <out.pdf>] [--stream] [--conformance <level>]

Options:
  --input,   -i   Path to JSON input file (default: stdin)
  --output,  -o   Output PDF path (default: stdout)
  --stream        Use streaming output for large documents
  --conformance   PDF/A conformance level: 1b, 2b, or 3b
  --help,    -h   Show this help message
`;

const SIGN_USAGE = `\
pdfnative sign — Apply a digital signature to an existing PDF

Usage:
  pdfnative sign [--input <file.pdf>] [--output <out.pdf>] [--key <key.pem>] [--cert <cert.pem>]

Options:
  --input,   -i   Path to input PDF (default: stdin)
  --output,  -o   Signed PDF output path (default: stdout)
  --key           Path to PEM private key file
                  (overridden by $PDFNATIVE_SIGN_KEY env var)
  --cert          Path to PEM certificate file
                  (overridden by $PDFNATIVE_SIGN_CERT env var)
  --help,    -h   Show this help message

Security: $PDFNATIVE_SIGN_KEY and $PDFNATIVE_SIGN_CERT env vars take precedence over file flags.
`;

const INSPECT_USAGE = `\
pdfnative inspect — Analyse a PDF and output metadata

Usage:
  pdfnative inspect [--input <file.pdf>] [--format <fmt>]

Options:
  --input,   -i   Path to input PDF (default: stdin)
  --format,  -f   Output format: json (default) or text
  --help,    -h   Show this help message
`;

function getVersion(): string {
    // Use createRequire to load package.json in an ESM-compatible way
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
        case 'inspect': {
            const m = await import('./commands/inspect.js');
            return m.inspect;
        }
        default:
            return Promise.reject(new CliError(`Unknown command: ${name}. Run pdfnative --help for usage.`, 1));
    }
}

async function main(): Promise<void> {
    const argv = process.argv.slice(2);
    const args = parseArgs(argv);

    // Global --help / -h
    if (hasFlag(args.flags, 'help', 'h') && args.positionals.length === 0) {
        process.stdout.write(USAGE);
        process.exit(0);
    }

    // Global --version / -V
    if (hasFlag(args.flags, 'version', 'V')) {
        process.stdout.write(getVersion() + '\n');
        process.exit(0);
    }

    const commandName = args.positionals[0];

    if (commandName === undefined) {
        process.stdout.write(USAGE);
        process.exit(0);
    }

    // Per-command --help
    if (hasFlag(args.flags, 'help', 'h')) {
        switch (commandName) {
            case 'render': process.stdout.write(RENDER_USAGE); break;
            case 'sign':   process.stdout.write(SIGN_USAGE);   break;
            case 'inspect': process.stdout.write(INSPECT_USAGE); break;
            default:
                process.stderr.write(`Unknown command: ${commandName}. Run pdfnative --help for usage.\n`);
                process.exit(1);
        }
        process.exit(0);
    }

    // Strip the command name from positionals before passing to the command
    const commandArgs = parseArgs(argv.filter((_t, _i) => {
        // Remove only the first positional (the command name itself)
        if (_t === commandName && args.positionals[0] === commandName) {
            return false;
        }
        return true;
    }));

    const command = await loadCommand(commandName);
    await command(commandArgs);
}

main().catch((e: unknown) => {
    if (e instanceof CliError) {
        process.stderr.write(e.message + '\n');
        process.exit(e.exitCode);
    }
    const message = e instanceof Error ? e.message : String(e);
    process.stderr.write(`Error: ${message}\n`);
    process.exit(1);
});
