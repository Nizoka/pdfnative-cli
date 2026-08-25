// `pdfnative completion <bash|zsh|fish|powershell>` — emit a shell completion
// script.
//
// The generated scripts are self-contained and driven by the static command /
// flag metadata below. Install by sourcing the output, e.g.:
//
//     pdfnative completion bash > /etc/bash_completion.d/pdfnative
//     pdfnative completion zsh  > "${fpath[1]}/_pdfnative"
//     pdfnative completion fish > ~/.config/fish/completions/pdfnative.fish
//     pdfnative completion powershell >> $PROFILE

import type { ParsedArgs } from '../utils/args.js';
import { CliError } from '../utils/error.js';

export interface CommandSpec {
    readonly name: string;
    readonly summary: string;
    readonly flags: readonly string[];
}

export const GLOBAL_FLAGS = ['--help', '--version', '--no-color', '--quiet', '--json', '--dry-run', '--config', '--no-config', '--max-inflate-size'];

// Shared password / re-encryption / streaming flags for the page-tree commands
// (merge, split, extract) — pdfnative 1.6.0.
const PAGETREE_CRYPTO_FLAGS = [
    '--password', '--encrypt', '--owner-password', '--user-password',
    '--permissions', '--stream', '--chunk-size',
];

export const COMMANDS: readonly CommandSpec[] = [
    {
        name: 'render',
        summary: 'Render a JSON document definition to PDF',
        flags: [
            '--input', '--output', '--stream', '--stream-page-by-page', '--stream-true',
            '--max-blocks', '--watch', '--template',
            '--variant', '--table-wrap', '--repeat-header', '--zebra', '--min-row-height',
            '--cell-padding', '--layout', '--page-size', '--margin', '--tagged', '--compress',
            '--lang', '--font', '--outline', '--debug-layout', '--inspect-layout',
            '--header-left', '--header-center', '--header-right',
            '--footer-left', '--footer-center', '--footer-right',
            '--watermark-text', '--watermark-image', '--watermark-opacity',
            '--watermark-angle', '--watermark-color', '--watermark-font-size',
            '--watermark-position',
            '--encrypt', '--owner-password', '--user-password', '--permissions',
            '--encrypt-algorithm', '--encrypt-owner-pass', '--encrypt-user-pass',
            '--encrypt-permissions', '--attachment', '--strict', '--chunk-size',
        ],
    },
    {
        name: 'sign',
        summary: 'Apply a digital signature to a PDF',
        flags: [
            '--input', '--output', '--key', '--cert', '--cert-chain', '--algorithm',
            '--reason', '--name', '--location', '--contact', '--signing-time', '--timestamp',
            '--timestamp-digest', '--timestamp-nonce', '--allow-multiple', '--field-name',
            '--profile', '--digest', '--signature-rect', '--signature-page',
            '--placeholder-bytes', '--pure-crypto',
        ],
    },
    {
        name: 'verify',
        summary: 'Verify embedded PDF signatures',
        flags: ['--input', '--trust', '--strict', '--revocation', '--revocation-policy', '--format', '--summary', '--fields', '--pretty'],
    },
    {
        name: 'ltv',
        summary: 'PAdES B-LT: collect/embed OCSP+CRL validation data (/DSS)',
        flags: ['--input', '--output', '--online', '--prefer', '--extra-cert', '--data', '--timeout'],
    },
    {
        name: 'doc-timestamp',
        summary: 'PAdES B-LTA: append an RFC 3161 document timestamp',
        flags: ['--input', '--output', '--url', '--digest', '--field-name', '--placeholder-bytes', '--nonce', '--timeout'],
    },
    {
        name: 'inspect',
        summary: 'Analyse a PDF and output metadata',
        flags: ['--input', '--format', '--verbose', '--pages', '--pdfua', '--annotations', '--form-fields', '--encryption', '--signatures', '--password', '--check', '--summary', '--fields', '--pretty'],
    },
    {
        name: 'merge',
        summary: 'Concatenate multiple PDFs into one',
        flags: ['--input', '--output', '--drop-annotations', '--max-output-size', ...PAGETREE_CRYPTO_FLAGS],
    },
    {
        name: 'split',
        summary: 'Split a PDF into multiple PDFs',
        flags: ['--input', '--output-dir', '--pages', '--prefix', '--drop-annotations', '--max-output-size', ...PAGETREE_CRYPTO_FLAGS],
    },
    {
        name: 'extract',
        summary: 'Extract selected pages into a new PDF',
        flags: ['--input', '--output', '--pages', '--drop-annotations', '--max-output-size', ...PAGETREE_CRYPTO_FLAGS],
    },
    {
        name: 'extract-text',
        summary: 'Extract reading-order text (text|json|ndjson)',
        flags: ['--input', '--format', '--pages', '--runs', '--password', '--max-length', '--summary', '--fields', '--pretty'],
    },
    {
        name: 'fill',
        summary: 'Fill and/or flatten an AcroForm PDF',
        flags: ['--input', '--output', '--data', '--flatten', '--export', '--force', '--on-unknown', '--need-appearances', '--password'],
    },
    {
        name: 'encrypt',
        summary: 'Re-secure a PDF with AES-128/256 encryption',
        flags: ['--input', '--output', '--owner-password', '--user-password', '--algorithm', '--permissions', '--password', '--drop-annotations', '--max-output-size', '--stream', '--chunk-size'],
    },
    {
        name: 'decrypt',
        summary: 'Remove encryption from a PDF',
        flags: ['--input', '--output', '--password', '--drop-annotations', '--max-output-size', '--stream', '--chunk-size'],
    },
    {
        name: 'annotate',
        summary: 'Attach markup annotations to a PDF',
        flags: ['--input', '--output', '--annotations', '--password'],
    },
    {
        name: 'metadata',
        summary: 'Update PDF /Info + XMP metadata (incremental — keeps signatures)',
        flags: ['--input', '--output', '--title', '--author', '--subject', '--keywords', '--mod-date', '--from-json', '--password'],
    },
    {
        name: 'compare',
        summary: 'Diff two PDFs by text and structure',
        flags: ['--mode', '--format', '--tolerance', '--ignore-whitespace', '--pages', '--password-a', '--password-b', '--pretty'],
    },
    {
        name: 'batch',
        summary: 'Render a directory or run a multi-command manifest pipeline',
        flags: ['--input-dir', '--output-dir', '--concurrency', '--fail-fast', '--manifest', '--allow-network', '--continue-on-error', '--format', '--layout', '--variant', '--summary', '--fields', '--pretty'],
    },
    {
        name: 'govern',
        summary: 'AI-governance / HITL contract',
        flags: ['--input', '--format', '--pretty'],
    },
    {
        name: 'schema',
        summary: 'Print a JSON Schema for a CLI input/output shape',
        flags: [],
    },
    {
        name: 'completion',
        summary: 'Emit a shell completion script',
        flags: [],
    },
    {
        name: 'doctor',
        summary: 'Environment / capability preflight',
        flags: ['--format', '--json', '--pretty'],
    },
];

const COMMAND_NAMES = COMMANDS.map((c) => c.name);

function bashScript(): string {
    const cmds = COMMAND_NAMES.join(' ');
    const cases = COMMANDS.map(
        (c) => `        ${c.name}) opts="${[...c.flags, ...GLOBAL_FLAGS].join(' ')}" ;;`,
    ).join('\n');
    return `\
# bash completion for pdfnative
_pdfnative() {
    local cur prev words cword
    _init_completion 2>/dev/null || { cur="\${COMP_WORDS[COMP_CWORD]}"; }
    local cmd="\${COMP_WORDS[1]}"
    local opts="${GLOBAL_FLAGS.join(' ')}"
    if [[ \${COMP_CWORD} -eq 1 ]]; then
        COMPREPLY=( $(compgen -W "${cmds}" -- "\${cur}") )
        return 0
    fi
    case "\${cmd}" in
${cases}
    esac
    COMPREPLY=( $(compgen -W "\${opts}" -- "\${cur}") )
    return 0
}
complete -F _pdfnative pdfnative
`;
}

function zshScript(): string {
    const cmdLines = COMMANDS.map((c) => `        '${c.name}:${c.summary}'`).join('\n');
    const cases = COMMANDS.map(
        (c) =>
            `            ${c.name})\n                _values 'flags' ${[...c.flags, ...GLOBAL_FLAGS]
                .map((f) => `'${f}'`)
                .join(' ')} ;;`,
    ).join('\n');
    return `\
#compdef pdfnative
# zsh completion for pdfnative
_pdfnative() {
    local -a commands
    commands=(
${cmdLines}
    )
    if (( CURRENT == 2 )); then
        _describe 'command' commands
        return
    fi
    case "\${words[2]}" in
${cases}
    esac
}
_pdfnative "$@"
`;
}

function fishScript(): string {
    const lines: string[] = ['# fish completion for pdfnative'];
    lines.push("complete -c pdfnative -f");
    for (const c of COMMANDS) {
        lines.push(
            `complete -c pdfnative -n __fish_use_subcommand -a ${c.name} -d '${c.summary.replace(/'/g, "")}'`,
        );
    }
    for (const c of COMMANDS) {
        for (const flag of [...c.flags, ...GLOBAL_FLAGS]) {
            lines.push(
                `complete -c pdfnative -n '__fish_seen_subcommand_from ${c.name}' -l ${flag.replace(/^--/, '')}`,
            );
        }
    }
    return lines.join('\n') + '\n';
}

function powershellScript(): string {
    // A Register-ArgumentCompleter script block. First positional → command
    // names; after a command → that command's flags plus the global flags.
    const cmdList = COMMAND_NAMES.map((n) => `'${n}'`).join(', ');
    const cases = COMMANDS.map(
        (c) => `            '${c.name}' { @(${[...c.flags, ...GLOBAL_FLAGS].map((f) => `'${f}'`).join(', ')}) }`,
    ).join('\n');
    return `\
# PowerShell completion for pdfnative
# Add to your profile:  pdfnative completion powershell >> $PROFILE
Register-ArgumentCompleter -Native -CommandName pdfnative -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)
    $commands = @(${cmdList})
    $tokens = $commandAst.CommandElements | ForEach-Object { $_.ToString() }
    # tokens[0] is 'pdfnative'; tokens[1] is the sub-command when present.
    if ($tokens.Count -le 2 -and -not $wordToComplete.StartsWith('-')) {
        $commands | Where-Object { $_ -like "$wordToComplete*" } |
            ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
        return
    }
    $cmd = if ($tokens.Count -ge 2) { $tokens[1] } else { '' }
    $flags = switch ($cmd) {
${cases}
            default { @(${GLOBAL_FLAGS.map((f) => `'${f}'`).join(', ')}) }
    }
    $flags | Where-Object { $_ -like "$wordToComplete*" } |
        ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterName', $_) }
}
`;
}

export async function completion(args: ParsedArgs): Promise<void> {
    const shell = args.positionals[0];
    if (shell === undefined) {
        throw new CliError('Usage: pdfnative completion <bash|zsh|fish|powershell>', 2);
    }
    switch (shell) {
        case 'bash':
            process.stdout.write(bashScript());
            break;
        case 'zsh':
            process.stdout.write(zshScript());
            break;
        case 'fish':
            process.stdout.write(fishScript());
            break;
        case 'powershell':
        case 'pwsh':
            process.stdout.write(powershellScript());
            break;
        default:
            throw new CliError(`Unsupported shell "${shell}". Valid: bash, zsh, fish, powershell.`, 2);
    }
}
