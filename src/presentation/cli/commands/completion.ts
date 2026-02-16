/**
 * Completion Command Handler
 *
 * CLI command for generating shell completion scripts for bash, zsh, and fish.
 * Users can eval or source these scripts to enable tab-completion for the CLI.
 */

import { Command } from "commander";
import type { CommandResult } from "../command-result.js";

/**
 * Supported shell types for completion generation.
 */
export type ShellType = "bash" | "zsh" | "fish";

/**
 * Check if a string is a valid shell type.
 *
 * @param shell String to check
 * @returns True if shell is a valid ShellType
 */
export function isValidShell(shell: string): shell is ShellType {
    return shell === "bash" || shell === "zsh" || shell === "fish";
}

/**
 * Generate bash completion script.
 *
 * @returns Bash completion script string
 */
export function generateBashCompletion(): string {
    return `# memory-nexus bash completion
# Add to ~/.bashrc: eval "$(memory completion bash)"

_memory_completion() {
    local cur prev words cword
    _init_completion || return

    local commands="sync search list stats context related show browse install uninstall status doctor purge export import completion"
    local search_opts="--limit --project --role --session --after --before --case-sensitive --json --verbose --quiet"
    local list_opts="--limit --project --after --before --sort --json --verbose --quiet"
    local stats_opts="--projects --json --verbose --quiet"
    local context_opts="--limit --json --verbose --quiet"
    local related_opts="--limit --depth --json --verbose --quiet"
    local show_opts="--json --verbose --quiet"
    local browse_opts="--project"
    local sync_opts="--force --dry-run --verbose --quiet"
    local install_opts="--force"
    local uninstall_opts="--restore"
    local doctor_opts="--json --fix"
    local purge_opts="--before --dry-run --force --json --verbose --quiet"
    local export_opts="--json --verbose --quiet"
    local import_opts="--force --dry-run --json --verbose --quiet"
    local completion_opts=""

    case "\${prev}" in
        memory)
            COMPREPLY=( \$(compgen -W "\${commands}" -- "\${cur}") )
            return 0
            ;;
        search)
            COMPREPLY=( \$(compgen -W "\${search_opts}" -- "\${cur}") )
            return 0
            ;;
        list)
            COMPREPLY=( \$(compgen -W "\${list_opts}" -- "\${cur}") )
            return 0
            ;;
        stats)
            COMPREPLY=( \$(compgen -W "\${stats_opts}" -- "\${cur}") )
            return 0
            ;;
        context)
            COMPREPLY=( \$(compgen -W "\${context_opts}" -- "\${cur}") )
            return 0
            ;;
        related)
            COMPREPLY=( \$(compgen -W "\${related_opts}" -- "\${cur}") )
            return 0
            ;;
        show)
            COMPREPLY=( \$(compgen -W "\${show_opts}" -- "\${cur}") )
            return 0
            ;;
        browse)
            COMPREPLY=( \$(compgen -W "\${browse_opts}" -- "\${cur}") )
            return 0
            ;;
        sync)
            COMPREPLY=( \$(compgen -W "\${sync_opts}" -- "\${cur}") )
            return 0
            ;;
        install)
            COMPREPLY=( \$(compgen -W "\${install_opts}" -- "\${cur}") )
            return 0
            ;;
        uninstall)
            COMPREPLY=( \$(compgen -W "\${uninstall_opts}" -- "\${cur}") )
            return 0
            ;;
        doctor)
            COMPREPLY=( \$(compgen -W "\${doctor_opts}" -- "\${cur}") )
            return 0
            ;;
        purge)
            COMPREPLY=( \$(compgen -W "\${purge_opts}" -- "\${cur}") )
            return 0
            ;;
        export)
            COMPREPLY=( \$(compgen -W "\${export_opts}" -- "\${cur}") )
            return 0
            ;;
        import)
            COMPREPLY=( \$(compgen -W "\${import_opts}" -- "\${cur}") )
            return 0
            ;;
        completion)
            COMPREPLY=( \$(compgen -W "bash zsh fish" -- "\${cur}") )
            return 0
            ;;
        --role)
            COMPREPLY=( \$(compgen -W "user assistant" -- "\${cur}") )
            return 0
            ;;
        --sort)
            COMPREPLY=( \$(compgen -W "recent oldest largest" -- "\${cur}") )
            return 0
            ;;
    esac

    if [[ "\${cur}" == -* ]]; then
        case "\${words[1]}" in
            search) COMPREPLY=( \$(compgen -W "\${search_opts}" -- "\${cur}") ) ;;
            list) COMPREPLY=( \$(compgen -W "\${list_opts}" -- "\${cur}") ) ;;
            stats) COMPREPLY=( \$(compgen -W "\${stats_opts}" -- "\${cur}") ) ;;
            context) COMPREPLY=( \$(compgen -W "\${context_opts}" -- "\${cur}") ) ;;
            related) COMPREPLY=( \$(compgen -W "\${related_opts}" -- "\${cur}") ) ;;
            show) COMPREPLY=( \$(compgen -W "\${show_opts}" -- "\${cur}") ) ;;
            browse) COMPREPLY=( \$(compgen -W "\${browse_opts}" -- "\${cur}") ) ;;
            sync) COMPREPLY=( \$(compgen -W "\${sync_opts}" -- "\${cur}") ) ;;
            install) COMPREPLY=( \$(compgen -W "\${install_opts}" -- "\${cur}") ) ;;
            uninstall) COMPREPLY=( \$(compgen -W "\${uninstall_opts}" -- "\${cur}") ) ;;
            doctor) COMPREPLY=( \$(compgen -W "\${doctor_opts}" -- "\${cur}") ) ;;
            purge) COMPREPLY=( \$(compgen -W "\${purge_opts}" -- "\${cur}") ) ;;
            export) COMPREPLY=( \$(compgen -W "\${export_opts}" -- "\${cur}") ) ;;
            import) COMPREPLY=( \$(compgen -W "\${import_opts}" -- "\${cur}") ) ;;
        esac
        return 0
    fi

    COMPREPLY=( \$(compgen -W "\${commands}" -- "\${cur}") )
}

complete -F _memory_completion memory
`;
}

/**
 * Generate zsh completion script.
 *
 * @returns Zsh completion script string
 */
export function generateZshCompletion(): string {
    return `#compdef memory
# memory-nexus zsh completion
# Add to ~/.zshrc: eval "$(memory completion zsh)"

_memory() {
    local -a commands
    commands=(
        'sync:Sync Claude Code sessions to database'
        'search:Search messages across all sessions'
        'list:List sessions with filtering'
        'stats:Show database statistics'
        'context:Get context for a project'
        'related:Find sessions related to a given session'
        'show:Show session details and conversation'
        'browse:Browse and select sessions interactively'
        'install:Install automatic sync hook'
        'uninstall:Remove automatic sync hook'
        'status:Show hook installation status'
        'doctor:Check system health and diagnose issues'
        'purge:Remove old sessions from database'
        'export:Export database to JSON file'
        'import:Import database from JSON file'
        'completion:Generate shell completion script'
    )

    local -a search_opts list_opts stats_opts context_opts related_opts show_opts browse_opts
    local -a sync_opts install_opts uninstall_opts doctor_opts purge_opts export_opts import_opts completion_shells

    search_opts=(
        '--limit[Maximum number of results]:number'
        '--project[Filter by project name]:project'
        '--role[Filter by message role]:role:(user assistant)'
        '--session[Filter by session ID]:session'
        '--after[Filter by start date]:date'
        '--before[Filter by end date]:date'
        '--case-sensitive[Enable case-sensitive search]'
        '--json[Output as JSON]'
        '--verbose[Show detailed output]'
        '--quiet[Minimal output]'
    )

    list_opts=(
        '--limit[Maximum number of results]:number'
        '--project[Filter by project name]:project'
        '--after[Filter by start date]:date'
        '--before[Filter by end date]:date'
        '--sort[Sort order]:order:(recent oldest largest)'
        '--json[Output as JSON]'
        '--verbose[Show detailed output]'
        '--quiet[Minimal output]'
    )

    stats_opts=(
        '--projects[Number of top projects to show]:number'
        '--json[Output as JSON]'
        '--verbose[Show detailed output]'
        '--quiet[Minimal output]'
    )

    context_opts=(
        '--limit[Maximum number of results]:number'
        '--json[Output as JSON]'
        '--verbose[Show detailed output]'
        '--quiet[Minimal output]'
    )

    related_opts=(
        '--limit[Maximum number of results]:number'
        '--depth[Maximum hop depth]:number'
        '--json[Output as JSON]'
        '--verbose[Show detailed output]'
        '--quiet[Minimal output]'
    )

    show_opts=(
        '--json[Output as JSON]'
        '--verbose[Show detailed output]'
        '--quiet[Minimal output]'
    )

    browse_opts=(
        '--project[Filter by project name]:project'
    )

    sync_opts=(
        '--force[Force re-sync all sessions]'
        '--dry-run[Preview changes without syncing]'
        '--verbose[Show detailed output]'
        '--quiet[Minimal output]'
    )

    install_opts=(
        '--force[Overwrite existing hook]'
    )

    uninstall_opts=(
        '--restore[Restore original settings backup]'
    )

    doctor_opts=(
        '--json[Output as JSON]'
        '--fix[Attempt to fix common issues]'
    )

    purge_opts=(
        '--before[Delete sessions before date]:date'
        '--dry-run[Preview deletions without removing]'
        '--force[Skip confirmation prompt]'
        '--json[Output as JSON]'
        '--verbose[Show detailed output]'
        '--quiet[Minimal output]'
    )

    export_opts=(
        '--json[Output as JSON]'
        '--verbose[Show detailed output]'
        '--quiet[Minimal output]'
    )

    import_opts=(
        '--force[Overwrite existing data]'
        '--dry-run[Preview import without changes]'
        '--json[Output as JSON]'
        '--verbose[Show detailed output]'
        '--quiet[Minimal output]'
    )

    completion_shells=(bash zsh fish)

    _arguments -C \\
        '1:command:->command' \\
        '*::arg:->args'

    case "\$state" in
        command)
            _describe 'command' commands
            ;;
        args)
            case "\$words[1]" in
                search) _arguments "\$search_opts[@]" ':query:' ;;
                list) _arguments "\$list_opts[@]" ;;
                stats) _arguments "\$stats_opts[@]" ;;
                context) _arguments "\$context_opts[@]" ':project:' ;;
                related) _arguments "\$related_opts[@]" ':session:' ;;
                show) _arguments "\$show_opts[@]" ':session:' ;;
                browse) _arguments "\$browse_opts[@]" ;;
                sync) _arguments "\$sync_opts[@]" ;;
                install) _arguments "\$install_opts[@]" ;;
                uninstall) _arguments "\$uninstall_opts[@]" ;;
                doctor) _arguments "\$doctor_opts[@]" ;;
                purge) _arguments "\$purge_opts[@]" ;;
                export) _arguments "\$export_opts[@]" ':output-file:_files' ;;
                import) _arguments "\$import_opts[@]" ':input-file:_files' ;;
                completion) _arguments '1:shell:(bash zsh fish)' ;;
            esac
            ;;
    esac
}

_memory "\$@"
`;
}

/**
 * Generate fish completion script.
 *
 * @returns Fish completion script string
 */
export function generateFishCompletion(): string {
    return `# memory-nexus fish completion
# Save to ~/.config/fish/completions/memory.fish:
#   memory completion fish > ~/.config/fish/completions/memory.fish

# Disable file completion by default
complete -c memory -f

# Commands
complete -c memory -n "__fish_use_subcommand" -a sync -d "Sync Claude Code sessions to database"
complete -c memory -n "__fish_use_subcommand" -a search -d "Search messages across all sessions"
complete -c memory -n "__fish_use_subcommand" -a list -d "List sessions with filtering"
complete -c memory -n "__fish_use_subcommand" -a stats -d "Show database statistics"
complete -c memory -n "__fish_use_subcommand" -a context -d "Get context for a project"
complete -c memory -n "__fish_use_subcommand" -a related -d "Find sessions related to a given session"
complete -c memory -n "__fish_use_subcommand" -a show -d "Show session details and conversation"
complete -c memory -n "__fish_use_subcommand" -a browse -d "Browse and select sessions interactively"
complete -c memory -n "__fish_use_subcommand" -a install -d "Install automatic sync hook"
complete -c memory -n "__fish_use_subcommand" -a uninstall -d "Remove automatic sync hook"
complete -c memory -n "__fish_use_subcommand" -a status -d "Show hook installation status"
complete -c memory -n "__fish_use_subcommand" -a doctor -d "Check system health and diagnose issues"
complete -c memory -n "__fish_use_subcommand" -a purge -d "Remove old sessions from database"
complete -c memory -n "__fish_use_subcommand" -a export -d "Export database to JSON file"
complete -c memory -n "__fish_use_subcommand" -a import -d "Import database from JSON file"
complete -c memory -n "__fish_use_subcommand" -a completion -d "Generate shell completion script"

# search options
complete -c memory -n "__fish_seen_subcommand_from search" -l limit -d "Maximum number of results"
complete -c memory -n "__fish_seen_subcommand_from search" -l project -d "Filter by project name"
complete -c memory -n "__fish_seen_subcommand_from search" -l role -d "Filter by message role" -a "user assistant"
complete -c memory -n "__fish_seen_subcommand_from search" -l session -d "Filter by session ID"
complete -c memory -n "__fish_seen_subcommand_from search" -l after -d "Filter by start date"
complete -c memory -n "__fish_seen_subcommand_from search" -l before -d "Filter by end date"
complete -c memory -n "__fish_seen_subcommand_from search" -l case-sensitive -d "Enable case-sensitive search"
complete -c memory -n "__fish_seen_subcommand_from search" -l json -d "Output as JSON"
complete -c memory -n "__fish_seen_subcommand_from search" -l verbose -d "Show detailed output"
complete -c memory -n "__fish_seen_subcommand_from search" -l quiet -d "Minimal output"

# list options
complete -c memory -n "__fish_seen_subcommand_from list" -l limit -d "Maximum number of results"
complete -c memory -n "__fish_seen_subcommand_from list" -l project -d "Filter by project name"
complete -c memory -n "__fish_seen_subcommand_from list" -l after -d "Filter by start date"
complete -c memory -n "__fish_seen_subcommand_from list" -l before -d "Filter by end date"
complete -c memory -n "__fish_seen_subcommand_from list" -l sort -d "Sort order" -a "recent oldest largest"
complete -c memory -n "__fish_seen_subcommand_from list" -l json -d "Output as JSON"
complete -c memory -n "__fish_seen_subcommand_from list" -l verbose -d "Show detailed output"
complete -c memory -n "__fish_seen_subcommand_from list" -l quiet -d "Minimal output"

# stats options
complete -c memory -n "__fish_seen_subcommand_from stats" -l projects -d "Number of top projects to show"
complete -c memory -n "__fish_seen_subcommand_from stats" -l json -d "Output as JSON"
complete -c memory -n "__fish_seen_subcommand_from stats" -l verbose -d "Show detailed output"
complete -c memory -n "__fish_seen_subcommand_from stats" -l quiet -d "Minimal output"

# context options
complete -c memory -n "__fish_seen_subcommand_from context" -l limit -d "Maximum number of results"
complete -c memory -n "__fish_seen_subcommand_from context" -l json -d "Output as JSON"
complete -c memory -n "__fish_seen_subcommand_from context" -l verbose -d "Show detailed output"
complete -c memory -n "__fish_seen_subcommand_from context" -l quiet -d "Minimal output"

# related options
complete -c memory -n "__fish_seen_subcommand_from related" -l limit -d "Maximum number of results"
complete -c memory -n "__fish_seen_subcommand_from related" -l depth -d "Maximum hop depth"
complete -c memory -n "__fish_seen_subcommand_from related" -l json -d "Output as JSON"
complete -c memory -n "__fish_seen_subcommand_from related" -l verbose -d "Show detailed output"
complete -c memory -n "__fish_seen_subcommand_from related" -l quiet -d "Minimal output"

# show options
complete -c memory -n "__fish_seen_subcommand_from show" -l json -d "Output as JSON"
complete -c memory -n "__fish_seen_subcommand_from show" -l verbose -d "Show detailed output"
complete -c memory -n "__fish_seen_subcommand_from show" -l quiet -d "Minimal output"

# browse options
complete -c memory -n "__fish_seen_subcommand_from browse" -l project -d "Filter by project name"

# sync options
complete -c memory -n "__fish_seen_subcommand_from sync" -l force -d "Force re-sync all sessions"
complete -c memory -n "__fish_seen_subcommand_from sync" -l dry-run -d "Preview changes without syncing"
complete -c memory -n "__fish_seen_subcommand_from sync" -l verbose -d "Show detailed output"
complete -c memory -n "__fish_seen_subcommand_from sync" -l quiet -d "Minimal output"

# install options
complete -c memory -n "__fish_seen_subcommand_from install" -l force -d "Overwrite existing hook"

# uninstall options
complete -c memory -n "__fish_seen_subcommand_from uninstall" -l restore -d "Restore original settings backup"

# doctor options
complete -c memory -n "__fish_seen_subcommand_from doctor" -l json -d "Output as JSON"
complete -c memory -n "__fish_seen_subcommand_from doctor" -l fix -d "Attempt to fix common issues"

# purge options
complete -c memory -n "__fish_seen_subcommand_from purge" -l before -d "Delete sessions before date"
complete -c memory -n "__fish_seen_subcommand_from purge" -l dry-run -d "Preview deletions without removing"
complete -c memory -n "__fish_seen_subcommand_from purge" -l force -d "Skip confirmation prompt"
complete -c memory -n "__fish_seen_subcommand_from purge" -l json -d "Output as JSON"
complete -c memory -n "__fish_seen_subcommand_from purge" -l verbose -d "Show detailed output"
complete -c memory -n "__fish_seen_subcommand_from purge" -l quiet -d "Minimal output"

# export options
complete -c memory -n "__fish_seen_subcommand_from export" -l json -d "Output as JSON"
complete -c memory -n "__fish_seen_subcommand_from export" -l verbose -d "Show detailed output"
complete -c memory -n "__fish_seen_subcommand_from export" -l quiet -d "Minimal output"

# import options
complete -c memory -n "__fish_seen_subcommand_from import" -l force -d "Overwrite existing data"
complete -c memory -n "__fish_seen_subcommand_from import" -l dry-run -d "Preview import without changes"
complete -c memory -n "__fish_seen_subcommand_from import" -l json -d "Output as JSON"
complete -c memory -n "__fish_seen_subcommand_from import" -l verbose -d "Show detailed output"
complete -c memory -n "__fish_seen_subcommand_from import" -l quiet -d "Minimal output"

# completion shells
complete -c memory -n "__fish_seen_subcommand_from completion" -a "bash zsh fish"
`;
}

/**
 * Generate completion script for the specified shell.
 *
 * @param shell Shell type (bash, zsh, or fish)
 * @returns Completion script string
 * @throws Error if shell type is invalid
 */
export function generateCompletion(shell: ShellType): string {
    switch (shell) {
        case "bash":
            return generateBashCompletion();
        case "zsh":
            return generateZshCompletion();
        case "fish":
            return generateFishCompletion();
        default:
            // TypeScript exhaustive check - should never reach here
            const _exhaustive: never = shell;
            throw new Error(`Unknown shell type: ${_exhaustive}`);
    }
}

/**
 * Create the completion command for Commander.js.
 *
 * @returns Configured Command instance
 */
export function createCompletionCommand(): Command {
    const usageExamples = `
Usage:
  # Bash (add to ~/.bashrc)
  eval "$(memory completion bash)"

  # Zsh (add to ~/.zshrc)
  eval "$(memory completion zsh)"

  # Fish (save to completions directory)
  memory completion fish > ~/.config/fish/completions/memory.fish
`;

    return new Command("completion")
        .description("Generate shell completion script")
        .argument("<shell>", "Shell type (bash, zsh, or fish)")
        .addHelpText("after", usageExamples)
        .action((shell: string) => {
            const result = executeCompletionCommand(shell);
            process.exitCode = result.exitCode;
        });
}

/**
 * Execute the completion command with given shell argument.
 *
 * @param shell Shell type from CLI argument
 */
export function executeCompletionCommand(shell: string): CommandResult {
    if (!isValidShell(shell)) {
        console.error(`Error: Invalid shell type '${shell}'`);
        console.error("Valid shells: bash, zsh, fish");
        return { exitCode: 1 };
    }

    const script = generateCompletion(shell);
    console.log(script);
    return { exitCode: 0 };
}
