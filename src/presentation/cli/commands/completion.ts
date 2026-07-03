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
    return `# memory bash completion
# Add to ~/.bashrc: eval "$(memory completion bash)"

_memory_completion() {
    local cur prev words cword
    _init_completion || return

    local commands="sync search list stats context related show browse governance profile dream remote install uninstall status doctor audit-secrets purge export import backup restore migrate extract projections completion"
    local search_opts="--limit --project --role --session --after --before --case-sensitive --json --verbose --quiet"
    local list_opts="--limit --project --after --before --sort --json --verbose --quiet"
    local stats_opts="--projects --json --verbose --quiet"
    local context_opts="--limit --json --verbose --quiet"
    local related_opts="--limit --depth --json --verbose --quiet"
    local show_opts="--json --verbose --quiet"
    local browse_opts="--project"
    local governance_opts="--surface --project --status --limit --reason --at --scope --json"
    local profile_opts="show export rebuild --kind --limit --all --json"
    local dream_opts="propose-supersedence list show approve reject apply rollback --project --target --replacement --reason --source-event --type --confidence --status --kind --limit --confirm --json"
    local sync_opts="--force --dry-run --remote --verbose --quiet"
    local remote_opts="set remove status preflight doctor backup restore rollback --json --allow-local-path --no-auto-pull --no-auto-push --confirm"
    local install_opts="--force"
    local uninstall_opts="--restore"
    local doctor_opts="--json --fix --upgrade"
    local audit_secrets_opts="--json --db --skip-db --event-log --events-dir --skip-events --redact-db --quarantine-events --quarantine-dir --report"
    local purge_opts="--before --dry-run --force --json --verbose --quiet"
    local export_opts="--json --verbose --quiet --include-sensitive"
    local import_opts="--force --dry-run --json --verbose --quiet"
    local migrate_opts="--from-windows --dry-run --json --confirm"
    local extract_opts="--all --since --force --json --quiet"
    local backup_opts="create verify --json --quiet"
    local restore_opts="--dry-run --confirm --json"
    local projections_opts="rebuild --verify --confirm --json"
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
        governance)
            COMPREPLY=( \$(compgen -W "list show suppress unsuppress invalidate expire review consent-grant consent-revoke \${governance_opts}" -- "\${cur}") )
            return 0
            ;;
        profile)
            COMPREPLY=( \$(compgen -W "\${profile_opts}" -- "\${cur}") )
            return 0
            ;;
        dream)
            COMPREPLY=( \$(compgen -W "\${dream_opts}" -- "\${cur}") )
            return 0
            ;;
        sync)
            COMPREPLY=( \$(compgen -W "\${sync_opts}" -- "\${cur}") )
            return 0
            ;;
        remote)
            COMPREPLY=( \$(compgen -W "\${remote_opts}" -- "\${cur}") )
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
        audit-secrets)
            COMPREPLY=( \$(compgen -W "\${audit_secrets_opts}" -- "\${cur}") )
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
        migrate)
            COMPREPLY=( \$(compgen -W "\${migrate_opts}" -- "\${cur}") )
            return 0
            ;;
        extract)
            COMPREPLY=( \$(compgen -W "\${extract_opts}" -- "\${cur}") )
            return 0
            ;;
        backup)
            COMPREPLY=( \$(compgen -W "\${backup_opts}" -- "\${cur}") )
            return 0
            ;;
        restore)
            COMPREPLY=( \$(compgen -W "\${restore_opts}" -- "\${cur}") )
            return 0
            ;;
        projections)
            COMPREPLY=( \$(compgen -W "\${projections_opts}" -- "\${cur}") )
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
            governance) COMPREPLY=( \$(compgen -W "list show suppress unsuppress invalidate expire review consent-grant consent-revoke \${governance_opts}" -- "\${cur}") ) ;;
            profile) COMPREPLY=( \$(compgen -W "\${profile_opts}" -- "\${cur}") ) ;;
            dream) COMPREPLY=( \$(compgen -W "\${dream_opts}" -- "\${cur}") ) ;;
            sync) COMPREPLY=( \$(compgen -W "\${sync_opts}" -- "\${cur}") ) ;;
            remote) COMPREPLY=( \$(compgen -W "\${remote_opts}" -- "\${cur}") ) ;;
            install) COMPREPLY=( \$(compgen -W "\${install_opts}" -- "\${cur}") ) ;;
            uninstall) COMPREPLY=( \$(compgen -W "\${uninstall_opts}" -- "\${cur}") ) ;;
            doctor) COMPREPLY=( \$(compgen -W "\${doctor_opts}" -- "\${cur}") ) ;;
            audit-secrets) COMPREPLY=( \$(compgen -W "\${audit_secrets_opts}" -- "\${cur}") ) ;;
            purge) COMPREPLY=( \$(compgen -W "\${purge_opts}" -- "\${cur}") ) ;;
            export) COMPREPLY=( \$(compgen -W "\${export_opts}" -- "\${cur}") ) ;;
            import) COMPREPLY=( \$(compgen -W "\${import_opts}" -- "\${cur}") ) ;;
            migrate) COMPREPLY=( \$(compgen -W "\${migrate_opts}" -- "\${cur}") ) ;;
            extract) COMPREPLY=( \$(compgen -W "\${extract_opts}" -- "\${cur}") ) ;;
            backup) COMPREPLY=( \$(compgen -W "\${backup_opts}" -- "\${cur}") ) ;;
            restore) COMPREPLY=( \$(compgen -W "\${restore_opts}" -- "\${cur}") ) ;;
            projections) COMPREPLY=( \$(compgen -W "\${projections_opts}" -- "\${cur}") ) ;;
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
# memory zsh completion
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
        'governance:Inspect and control derived memory consent/provenance state'
        'profile:Inspect and rebuild governed persona/procedural memory'
        'dream:Create, review, apply, and rollback audited dream proposals'
        'remote:Manage remote event-log synchronization'
        'install:Install automatic sync hook'
        'uninstall:Remove automatic sync hook'
        'status:Show hook installation status'
        'doctor:Check system health and diagnose issues'
        'audit-secrets:Scan database and event logs for likely leaked secrets'
        'purge:Remove old sessions from database'
        'export:Export database to JSON file'
        'import:Import database from JSON file'
        'backup:Create and verify local memory backups'
        'restore:Restore local memory data from a backup'
        'migrate:Migrate database across platform environments'
        'extract:Extract facts from session messages using LLM'
        'projections:Verify and rebuild derived memory projections'
        'completion:Generate shell completion script'
    )

    local -a search_opts list_opts stats_opts context_opts related_opts show_opts browse_opts governance_opts profile_opts dream_opts
    local -a sync_opts remote_opts install_opts uninstall_opts doctor_opts audit_secrets_opts purge_opts export_opts import_opts migrate_opts extract_opts backup_opts restore_opts projections_opts completion_shells

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

    governance_opts=(
        '--surface[Governance surface]:surface:(fact context provider_egress remote_sync friction evaluation persona graph ranking dream projection)'
        '--project[Filter by project name]:project'
        '--status[Governance status]:status:(active pending_review suppressed invalidated expired)'
        '--limit[Maximum number of entries]:number'
        '--reason[Reason for the control event]:reason'
        '--at[Expiry timestamp]:iso-date'
        '--scope[Consent scope]:scope'
        '--json[Output as JSON]'
    )

    profile_opts=(
        '1:action:(show export rebuild)'
        '--kind[Persona entry kind]:kind:(preference procedure correction decision_pattern friction_pattern)'
        '--limit[Maximum number of entries]:number'
        '--all[Use every project scope where supported]'
        '--json[Output as JSON]'
    )

    dream_opts=(
        '1:action:(propose-supersedence list show approve reject apply rollback)'
        '--project[Project scope or filter]:project'
        '--target[Target fact UUID to supersede]:fact-uuid'
        '--replacement[Replacement fact content]:content'
        '--reason[Reason for proposal]:reason'
        '--source-event[Source event id]:event-id'
        '--type[Replacement fact type]:type:(decision learning preference friction observation supersedence)'
        '--confidence[Proposal confidence]:number'
        '--status[Dream status]:status:(pending_review approved rejected applied rolled_back)'
        '--kind[Dream proposal kind]:kind:(supersedence_proposal)'
        '--limit[Maximum entries]:number'
        '--confirm[Confirm apply or rollback mutation]'
        '--json[Output as JSON]'
    )

    sync_opts=(
        '--force[Force re-sync all sessions]'
        '--dry-run[Preview changes without syncing]'
        '--remote[Synchronize canonical event logs with configured remote]'
        '--verbose[Show detailed output]'
        '--quiet[Minimal output]'
    )

    remote_opts=(
        '1:action:(set remove status preflight doctor backup restore rollback)'
        '--json[Output stable JSON]'
        '--allow-local-path[Allow local path remotes]'
        '--no-auto-pull[Disable automatic remote pull]'
        '--no-auto-push[Disable automatic remote push]'
        '--confirm[Confirm restore or rollback mutation]'
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
        '--upgrade[Perform upgrade readiness diagnostics]'
    )

    audit_secrets_opts=(
        '--json[Output as JSON]'
        '--db[Database path override]:path:_files'
        '--skip-db[Skip database scanning]'
        '--event-log[Specific event log path]:path:_files'
        '--events-dir[Events directory to scan]:directory:_files -/'
        '--skip-events[Skip event-log scanning]'
        '--redact-db[Rewrite mutable database fields with redacted values]'
        '--quarantine-events[Quarantine raw event logs and write sanitized active copies]'
        '--quarantine-dir[Quarantine directory]:directory:_files -/'
        '--report[Write a redacted evidence report]:path:_files'
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
        '--include-sensitive[Export raw sensitive values without redaction]'
    )

    import_opts=(
        '--force[Overwrite existing data]'
        '--dry-run[Preview import without changes]'
        '--json[Output as JSON]'
        '--verbose[Show detailed output]'
        '--quiet[Minimal output]'
    )

    migrate_opts=(
        '--from-windows[Migrate database from native Windows or desktop host]'
        '--dry-run[Check migration readiness without mutation]'
        '--json[Output as JSON]'
        '--confirm[Confirm migration mutation]'
    )

    extract_opts=(
        '--all[Process all sessions matching this project]'
        '--since[Filter sessions by age]:duration'
        '--force[Force extraction even on previously processed sessions]'
        '--json[Output as JSON]'
        '--quiet[Minimal output]'
    )

    backup_opts=(
        '1:action:(create verify)'
        '--json[Output as JSON]'
        '--quiet[Print only the backup path]'
    )

    restore_opts=(
        '--dry-run[Verify restore without mutation]'
        '--confirm[Confirm restore mutation]'
        '--json[Output as JSON]'
    )

    projections_opts=(
        '1:action:(rebuild)'
        '--verify[Verify without mutation]'
        '--confirm[Confirm rebuild mutation]'
        '--json[Output as JSON]'
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
                governance) _arguments '1:action:(list show suppress unsuppress invalidate expire review consent-grant consent-revoke)' "\$governance_opts[@]" ':target:' ;;
                profile) _arguments "\$profile_opts[@]" ':project:' ;;
                dream) _arguments "\$dream_opts[@]" ':dream-id:' ;;
                sync) _arguments "\$sync_opts[@]" ;;
                remote) _arguments "\$remote_opts[@]" ':repository-url:' ;;
                install) _arguments "\$install_opts[@]" ;;
                uninstall) _arguments "\$uninstall_opts[@]" ;;
                doctor) _arguments "\$doctor_opts[@]" ;;
                audit-secrets) _arguments "\$audit_secrets_opts[@]" ;;
                purge) _arguments "\$purge_opts[@]" ;;
                export) _arguments "\$export_opts[@]" ':output-file:_files' ;;
                import) _arguments "\$import_opts[@]" ':input-file:_files' ;;
                migrate) _arguments "\$migrate_opts[@]" ;;
                extract) _arguments "\$extract_opts[@]" ':project:' ;;
                backup) _arguments "\$backup_opts[@]" ':backup-path:_files -/' ;;
                restore) _arguments "\$restore_opts[@]" ':backup-path:_files -/' ;;
                projections) _arguments "\$projections_opts[@]" ;;
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
    return `# memory fish completion
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
complete -c memory -n "__fish_use_subcommand" -a governance -d "Inspect and control derived memory consent/provenance state"
complete -c memory -n "__fish_use_subcommand" -a profile -d "Inspect and rebuild governed persona/procedural memory"
complete -c memory -n "__fish_use_subcommand" -a dream -d "Create, review, apply, and rollback audited dream proposals"
complete -c memory -n "__fish_use_subcommand" -a remote -d "Manage remote event-log synchronization"
complete -c memory -n "__fish_use_subcommand" -a install -d "Install automatic sync hook"
complete -c memory -n "__fish_use_subcommand" -a uninstall -d "Remove automatic sync hook"
complete -c memory -n "__fish_use_subcommand" -a status -d "Show hook installation status"
complete -c memory -n "__fish_use_subcommand" -a doctor -d "Check system health and diagnose issues"
complete -c memory -n "__fish_use_subcommand" -a audit-secrets -d "Scan database and event logs for likely leaked secrets"
complete -c memory -n "__fish_use_subcommand" -a purge -d "Remove old sessions from database"
complete -c memory -n "__fish_use_subcommand" -a export -d "Export database to JSON file"
complete -c memory -n "__fish_use_subcommand" -a import -d "Import database from JSON file"
complete -c memory -n "__fish_use_subcommand" -a backup -d "Create and verify local memory backups"
complete -c memory -n "__fish_use_subcommand" -a restore -d "Restore local memory data from a backup"
complete -c memory -n "__fish_use_subcommand" -a migrate -d "Migrate database across platform environments"
complete -c memory -n "__fish_use_subcommand" -a extract -d "Extract facts from session messages using LLM"
complete -c memory -n "__fish_use_subcommand" -a projections -d "Verify and rebuild derived memory projections"
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

# governance actions and options
complete -c memory -n "__fish_seen_subcommand_from governance" -a "list show suppress unsuppress invalidate expire review consent-grant consent-revoke"
complete -c memory -n "__fish_seen_subcommand_from governance" -l surface -d "Governance surface" -a "fact context provider_egress remote_sync friction evaluation persona graph ranking dream projection"
complete -c memory -n "__fish_seen_subcommand_from governance" -l project -d "Filter by project name"
complete -c memory -n "__fish_seen_subcommand_from governance" -l status -d "Governance status" -a "active pending_review suppressed invalidated expired"
complete -c memory -n "__fish_seen_subcommand_from governance" -l limit -d "Maximum number of entries"
complete -c memory -n "__fish_seen_subcommand_from governance" -l reason -d "Reason for the control event"
complete -c memory -n "__fish_seen_subcommand_from governance" -l at -d "Expiry timestamp"
complete -c memory -n "__fish_seen_subcommand_from governance" -l scope -d "Consent scope"
complete -c memory -n "__fish_seen_subcommand_from governance" -l json -d "Output as JSON"

# profile actions and options
complete -c memory -n "__fish_seen_subcommand_from profile" -a "show export rebuild"
complete -c memory -n "__fish_seen_subcommand_from profile" -l kind -d "Persona entry kind" -a "preference procedure correction decision_pattern friction_pattern"
complete -c memory -n "__fish_seen_subcommand_from profile" -l limit -d "Maximum number of entries"
complete -c memory -n "__fish_seen_subcommand_from profile" -l all -d "Use every project scope where supported"
complete -c memory -n "__fish_seen_subcommand_from profile" -l json -d "Output as JSON"

# dream actions and options
complete -c memory -n "__fish_seen_subcommand_from dream" -a "propose-supersedence list show approve reject apply rollback"
complete -c memory -n "__fish_seen_subcommand_from dream" -l project -d "Project scope or filter"
complete -c memory -n "__fish_seen_subcommand_from dream" -l target -d "Target fact UUID to supersede"
complete -c memory -n "__fish_seen_subcommand_from dream" -l replacement -d "Replacement fact content"
complete -c memory -n "__fish_seen_subcommand_from dream" -l reason -d "Reason for proposal"
complete -c memory -n "__fish_seen_subcommand_from dream" -l source-event -d "Source event id"
complete -c memory -n "__fish_seen_subcommand_from dream" -l type -d "Replacement fact type" -a "decision learning preference friction observation supersedence"
complete -c memory -n "__fish_seen_subcommand_from dream" -l confidence -d "Proposal confidence"
complete -c memory -n "__fish_seen_subcommand_from dream" -l status -d "Dream status" -a "pending_review approved rejected applied rolled_back"
complete -c memory -n "__fish_seen_subcommand_from dream" -l kind -d "Dream proposal kind" -a "supersedence_proposal"
complete -c memory -n "__fish_seen_subcommand_from dream" -l limit -d "Maximum entries"
complete -c memory -n "__fish_seen_subcommand_from dream" -l confirm -d "Confirm apply or rollback mutation"
complete -c memory -n "__fish_seen_subcommand_from dream" -l json -d "Output as JSON"

# sync options
complete -c memory -n "__fish_seen_subcommand_from sync" -l force -d "Force re-sync all sessions"
complete -c memory -n "__fish_seen_subcommand_from sync" -l dry-run -d "Preview changes without syncing"
complete -c memory -n "__fish_seen_subcommand_from sync" -l remote -d "Synchronize canonical event logs with configured remote"
complete -c memory -n "__fish_seen_subcommand_from sync" -l verbose -d "Show detailed output"
complete -c memory -n "__fish_seen_subcommand_from sync" -l quiet -d "Minimal output"

# remote actions and options
complete -c memory -n "__fish_seen_subcommand_from remote" -a "set remove status preflight doctor backup restore rollback"
complete -c memory -n "__fish_seen_subcommand_from remote" -l json -d "Output stable JSON"
complete -c memory -n "__fish_seen_subcommand_from remote" -l allow-local-path -d "Allow local path remotes"
complete -c memory -n "__fish_seen_subcommand_from remote" -l no-auto-pull -d "Disable automatic remote pull"
complete -c memory -n "__fish_seen_subcommand_from remote" -l no-auto-push -d "Disable automatic remote push"
complete -c memory -n "__fish_seen_subcommand_from remote" -l confirm -d "Confirm restore or rollback mutation"

# install options
complete -c memory -n "__fish_seen_subcommand_from install" -l force -d "Overwrite existing hook"

# uninstall options
complete -c memory -n "__fish_seen_subcommand_from uninstall" -l restore -d "Restore original settings backup"

# doctor options
complete -c memory -n "__fish_seen_subcommand_from doctor" -l json -d "Output as JSON"
complete -c memory -n "__fish_seen_subcommand_from doctor" -l fix -d "Attempt to fix common issues"
complete -c memory -n "__fish_seen_subcommand_from doctor" -l upgrade -d "Perform upgrade readiness diagnostics"

# audit-secrets options
complete -c memory -n "__fish_seen_subcommand_from audit-secrets" -l json -d "Output as JSON"
complete -c memory -n "__fish_seen_subcommand_from audit-secrets" -l db -d "Database path override" -r
complete -c memory -n "__fish_seen_subcommand_from audit-secrets" -l skip-db -d "Skip database scanning"
complete -c memory -n "__fish_seen_subcommand_from audit-secrets" -l event-log -d "Specific event log path" -r
complete -c memory -n "__fish_seen_subcommand_from audit-secrets" -l events-dir -d "Events directory to scan" -r
complete -c memory -n "__fish_seen_subcommand_from audit-secrets" -l skip-events -d "Skip event-log scanning"
complete -c memory -n "__fish_seen_subcommand_from audit-secrets" -l redact-db -d "Rewrite mutable database fields with redacted values"
complete -c memory -n "__fish_seen_subcommand_from audit-secrets" -l quarantine-events -d "Quarantine raw event logs and write sanitized active copies"
complete -c memory -n "__fish_seen_subcommand_from audit-secrets" -l quarantine-dir -d "Quarantine directory" -r
complete -c memory -n "__fish_seen_subcommand_from audit-secrets" -l report -d "Write a redacted evidence report" -r

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
complete -c memory -n "__fish_seen_subcommand_from export" -l include-sensitive -d "Export raw sensitive values without redaction"

# import options
complete -c memory -n "__fish_seen_subcommand_from import" -l force -d "Overwrite existing data"
complete -c memory -n "__fish_seen_subcommand_from import" -l dry-run -d "Preview import without changes"
complete -c memory -n "__fish_seen_subcommand_from import" -l json -d "Output as JSON"
complete -c memory -n "__fish_seen_subcommand_from import" -l verbose -d "Show detailed output"
complete -c memory -n "__fish_seen_subcommand_from import" -l quiet -d "Minimal output"

# migrate options
complete -c memory -n "__fish_seen_subcommand_from migrate" -l from-windows -d "Migrate database from native Windows or desktop host"
complete -c memory -n "__fish_seen_subcommand_from migrate" -l dry-run -d "Check migration readiness without mutation"
complete -c memory -n "__fish_seen_subcommand_from migrate" -l json -d "Output as JSON"
complete -c memory -n "__fish_seen_subcommand_from migrate" -l confirm -d "Confirm migration mutation"

# extract options
complete -c memory -n "__fish_seen_subcommand_from extract" -l all -d "Process all sessions matching this project"
complete -c memory -n "__fish_seen_subcommand_from extract" -l since -d "Filter sessions by age" -r
complete -c memory -n "__fish_seen_subcommand_from extract" -l force -d "Force extraction even on previously processed sessions"
complete -c memory -n "__fish_seen_subcommand_from extract" -l json -d "Output as JSON"
complete -c memory -n "__fish_seen_subcommand_from extract" -l quiet -d "Minimal output"

# backup options
complete -c memory -n "__fish_seen_subcommand_from backup" -a "create verify"
complete -c memory -n "__fish_seen_subcommand_from backup" -l json -d "Output as JSON"
complete -c memory -n "__fish_seen_subcommand_from backup" -l quiet -d "Print only the backup path"

# restore options
complete -c memory -n "__fish_seen_subcommand_from restore" -l dry-run -d "Verify restore without mutation"
complete -c memory -n "__fish_seen_subcommand_from restore" -l confirm -d "Confirm restore mutation"
complete -c memory -n "__fish_seen_subcommand_from restore" -l json -d "Output as JSON"

# projections options
complete -c memory -n "__fish_seen_subcommand_from projections" -a "rebuild"
complete -c memory -n "__fish_seen_subcommand_from projections" -l verify -d "Verify without mutation"
complete -c memory -n "__fish_seen_subcommand_from projections" -l confirm -d "Confirm rebuild mutation"
complete -c memory -n "__fish_seen_subcommand_from projections" -l json -d "Output as JSON"

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
 * Execute the completion command programmatically.
 *
 * Outputs a shell completion script for the specified shell type.
 * Supported shells: bash, zsh, fish.
 *
 * @param shell - Shell type (bash, zsh, or fish)
 * @returns CommandResult with exitCode 0 (success) or 1 (invalid shell)
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
