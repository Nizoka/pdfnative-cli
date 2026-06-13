// `pdfnative completion <bash|zsh|fish>` — emit a shell completion script.
//
// The generated scripts are self-contained and driven by the static command /
// flag metadata below. Install by sourcing the output, e.g.:
//
//     pdfnative completion bash > /etc/bash_completion.d/pdfnative
//     pdfnative completion zsh  > "${fpath[1]}/_pdfnative"
//     pdfnative completion fish > ~/.config/fish/completions/pdfnative.fish

import type { ParsedArgs } from '../utils/args.js';
import { CliError } from '../utils/error.js';

interface CommandSpec {
    readonly name: string;
    readonly summary: string;
    readonly flags: readonly string[];
}

const GLOBAL_FLAGS = ['--help', '--version', '--no-color', '--quiet', '--json', '--dry-run', '--config', '--no-config'];

const COMMANDS: readonly CommandSpec[] = [
    {
        name: 'render',
        summary: 'Render a JSON document definition to PDF',
        flags: [
            '--input', '--output', '--stream', '--stream-page-by-page', '--stream-true',
            '--max-blocks', '--watch', '--template',
            '--variant', '--table-wrap', '--repeat-header', '--zebra', '--min-row-height',
            '--cell-padding', '--layout', '--page-size', '--margin', '--tagged', '--compress',
            '--lang', '--font',
            '--header-left', '--header-center', '--header-right',
            '--footer-left', '--footer-center', '--footer-right',
            '--watermark-text', '--watermark-image', '--watermark-opacity',
            '--watermark-angle', '--watermark-color', '--watermark-font-size',
            '--watermark-position',
            '--encrypt-algorithm', '--encrypt-owner-pass', '--encrypt-user-pass',
            '--encrypt-permissions', '--attachment',
        ],
    },
    {
        name: 'sign',
        summary: 'Apply a digital signature to a PDF',
        flags: [
            '--input', '--output', '--key', '--cert', '--cert-chain', '--algorithm',
            '--reason', '--name', '--location', '--contact', '--signing-time', '--timestamp',
        ],
    },
    {
        name: 'verify',
        summary: 'Verify embedded PDF signatures',
        flags: ['--input', '--trust', '--strict', '--revocation', '--revocation-policy', '--format', '--summary', '--fields', '--pretty'],
    },
    {
        name: 'inspect',
        summary: 'Analyse a PDF and output metadata',
        flags: ['--input', '--format', '--verbose', '--pages', '--pdfua', '--check', '--summary', '--fields', '--pretty'],
    },
    {
        name: 'batch',
        summary: 'Render many JSON inputs to PDF in parallel',
        flags: ['--input-dir', '--output-dir', '--concurrency', '--fail-fast', '--format', '--layout', '--variant', '--summary', '--fields', '--pretty'],
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

export async function completion(args: ParsedArgs): Promise<void> {
    const shell = args.positionals[0];
    if (shell === undefined) {
        throw new CliError('Usage: pdfnative completion <bash|zsh|fish>', 2);
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
        default:
            throw new CliError(`Unsupported shell "${shell}". Valid: bash, zsh, fish.`, 2);
    }
}
