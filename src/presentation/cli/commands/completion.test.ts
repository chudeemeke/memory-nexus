/**
 * Completion Command Tests
 *
 * Tests for the completion command that generates shell completion scripts.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
    createCompletionCommand,
    executeCompletionCommand,
    generateBashCompletion,
    generateZshCompletion,
    generateFishCompletion,
    generateCompletion,
    isValidShell,
} from "./completion.js";

describe("completion command", () => {
    // Capture console output
    let consoleOutput: string[] = [];
    let consoleErrors: string[] = [];
    let exitCode: number | undefined;
    const originalLog = console.log;
    const originalError = console.error;
    const originalExit = process.exit;

    beforeEach(() => {
        consoleOutput = [];
        consoleErrors = [];
        exitCode = undefined;
        console.log = (msg: string) => consoleOutput.push(msg);
        console.error = (msg: string) => consoleErrors.push(msg);
        process.exit = ((code?: number) => {
            exitCode = code;
            throw new Error(`process.exit(${code})`);
        }) as never;
    });

    afterEach(() => {
        console.log = originalLog;
        console.error = originalError;
        process.exit = originalExit;
    });

    describe("isValidShell", () => {
        it("returns true for bash", () => {
            expect(isValidShell("bash")).toBe(true);
        });

        it("returns true for zsh", () => {
            expect(isValidShell("zsh")).toBe(true);
        });

        it("returns true for fish", () => {
            expect(isValidShell("fish")).toBe(true);
        });

        it("returns false for invalid shell", () => {
            expect(isValidShell("invalid")).toBe(false);
        });

        it("returns false for empty string", () => {
            expect(isValidShell("")).toBe(false);
        });

        it("returns false for sh", () => {
            expect(isValidShell("sh")).toBe(false);
        });
    });

    describe("createCompletionCommand", () => {
        it("creates command with correct name", () => {
            const cmd = createCompletionCommand();
            expect(cmd.name()).toBe("completion");
        });

        it("has description", () => {
            const cmd = createCompletionCommand();
            expect(cmd.description()).toContain("completion");
        });

        it("requires shell argument", () => {
            const cmd = createCompletionCommand();
            const args = cmd.registeredArguments;
            expect(args.length).toBe(1);
            expect(args[0].name()).toBe("shell");
            expect(args[0].required).toBe(true);
        });

        it("has shell argument description", () => {
            const cmd = createCompletionCommand();
            const args = cmd.registeredArguments;
            expect(args[0].description).toContain("bash");
            expect(args[0].description).toContain("zsh");
            expect(args[0].description).toContain("fish");
        });
    });

    describe("generateBashCompletion", () => {
        it("outputs valid bash syntax with complete command", () => {
            const script = generateBashCompletion();
            expect(script).toContain("complete -F");
        });

        it("contains compgen for completions", () => {
            const script = generateBashCompletion();
            expect(script).toContain("compgen");
        });

        it("includes all memory commands", () => {
            const script = generateBashCompletion();
            expect(script).toContain("sync");
            expect(script).toContain("search");
            expect(script).toContain("list");
            expect(script).toContain("stats");
            expect(script).toContain("context");
            expect(script).toContain("related");
            expect(script).toContain("show");
            expect(script).toContain("browse");
            expect(script).toContain("install");
            expect(script).toContain("uninstall");
            expect(script).toContain("status");
            expect(script).toContain("doctor");
            expect(script).toContain("purge");
            expect(script).toContain("export");
            expect(script).toContain("import");
            expect(script).toContain("completion");
        });

        it("includes usage comment", () => {
            const script = generateBashCompletion();
            expect(script).toContain("~/.bashrc");
            expect(script).toContain("eval");
        });

        it("defines COMPREPLY variable", () => {
            const script = generateBashCompletion();
            expect(script).toContain("COMPREPLY");
        });
    });

    describe("generateZshCompletion", () => {
        it("outputs valid zsh syntax with compdef", () => {
            const script = generateZshCompletion();
            expect(script).toContain("#compdef memory");
        });

        it("contains _arguments for option handling", () => {
            const script = generateZshCompletion();
            expect(script).toContain("_arguments");
        });

        it("includes all memory commands with descriptions", () => {
            const script = generateZshCompletion();
            expect(script).toContain("'sync:Sync Claude Code sessions");
            expect(script).toContain("'search:Search messages");
            expect(script).toContain("'list:List sessions");
            expect(script).toContain("'stats:Show database");
            expect(script).toContain("'context:Get context");
            expect(script).toContain("'related:Find sessions");
            expect(script).toContain("'show:Show session");
            expect(script).toContain("'browse:Browse and select");
            expect(script).toContain("'install:Install automatic");
            expect(script).toContain("'uninstall:Remove automatic");
            expect(script).toContain("'status:Show hook");
            expect(script).toContain("'doctor:Check system health");
            expect(script).toContain("'purge:Remove old sessions");
            expect(script).toContain("'export:Export database");
            expect(script).toContain("'import:Import database");
            expect(script).toContain("'completion:Generate shell");
        });

        it("includes usage comment", () => {
            const script = generateZshCompletion();
            expect(script).toContain("~/.zshrc");
            expect(script).toContain("eval");
        });

        it("defines _describe for commands", () => {
            const script = generateZshCompletion();
            expect(script).toContain("_describe");
        });
    });

    describe("generateFishCompletion", () => {
        it("outputs valid fish syntax with complete -c", () => {
            const script = generateFishCompletion();
            expect(script).toContain("complete -c memory");
        });

        it("uses __fish_use_subcommand for commands", () => {
            const script = generateFishCompletion();
            expect(script).toContain("__fish_use_subcommand");
        });

        it("uses __fish_seen_subcommand_from for options", () => {
            const script = generateFishCompletion();
            expect(script).toContain("__fish_seen_subcommand_from");
        });

        it("includes all memory commands with descriptions", () => {
            const script = generateFishCompletion();
            expect(script).toContain('-a sync -d "Sync Claude');
            expect(script).toContain('-a search -d "Search messages');
            expect(script).toContain('-a list -d "List sessions');
            expect(script).toContain('-a stats -d "Show database');
            expect(script).toContain('-a context -d "Get context');
            expect(script).toContain('-a related -d "Find sessions');
            expect(script).toContain('-a show -d "Show session');
            expect(script).toContain('-a browse -d "Browse and');
            expect(script).toContain('-a install -d "Install automatic');
            expect(script).toContain('-a uninstall -d "Remove automatic');
            expect(script).toContain('-a status -d "Show hook');
            expect(script).toContain('-a doctor -d "Check system');
            expect(script).toContain('-a purge -d "Remove old');
            expect(script).toContain('-a export -d "Export database');
            expect(script).toContain('-a import -d "Import database');
            expect(script).toContain('-a completion -d "Generate shell');
        });

        it("includes usage comment", () => {
            const script = generateFishCompletion();
            expect(script).toContain("~/.config/fish/completions/memory.fish");
        });

        it("disables file completion by default", () => {
            const script = generateFishCompletion();
            expect(script).toContain("complete -c memory -f");
        });
    });

    describe("generateCompletion", () => {
        it("generates bash completion", () => {
            const script = generateCompletion("bash");
            expect(script).toContain("complete -F");
        });

        it("generates zsh completion", () => {
            const script = generateCompletion("zsh");
            expect(script).toContain("#compdef memory");
        });

        it("generates fish completion", () => {
            const script = generateCompletion("fish");
            expect(script).toContain("complete -c memory");
        });
    });

    describe("executeCompletionCommand", () => {
        it("outputs bash completion for bash argument", () => {
            executeCompletionCommand("bash");

            const output = consoleOutput.join("\n");
            expect(output).toContain("complete -F");
            expect(exitCode).toBeUndefined();
        });

        it("outputs zsh completion for zsh argument", () => {
            executeCompletionCommand("zsh");

            const output = consoleOutput.join("\n");
            expect(output).toContain("#compdef memory");
            expect(exitCode).toBeUndefined();
        });

        it("outputs fish completion for fish argument", () => {
            executeCompletionCommand("fish");

            const output = consoleOutput.join("\n");
            expect(output).toContain("complete -c memory");
            expect(exitCode).toBeUndefined();
        });

        it("shows error for invalid shell", () => {
            try {
                executeCompletionCommand("invalid");
            } catch {
                // Expected process.exit
            }

            const errorOutput = consoleErrors.join("\n");
            expect(errorOutput).toContain("Invalid shell type");
            expect(errorOutput).toContain("invalid");
            expect(errorOutput).toContain("bash, zsh, fish");
            expect(exitCode).toBe(1);
        });

        it("shows error for empty shell", () => {
            try {
                executeCompletionCommand("");
            } catch {
                // Expected process.exit
            }

            const errorOutput = consoleErrors.join("\n");
            expect(errorOutput).toContain("Invalid shell type");
            expect(exitCode).toBe(1);
        });
    });

    describe("option coverage in completions", () => {
        it("bash includes search options", () => {
            const script = generateBashCompletion();
            expect(script).toContain("--limit");
            expect(script).toContain("--project");
            expect(script).toContain("--role");
            expect(script).toContain("--session");
            expect(script).toContain("--json");
            expect(script).toContain("--verbose");
            expect(script).toContain("--quiet");
        });

        it("zsh includes search options with descriptions", () => {
            const script = generateZshCompletion();
            expect(script).toContain("'--limit[Maximum number");
            expect(script).toContain("'--project[Filter by project");
            expect(script).toContain("'--json[Output as JSON]");
        });

        it("fish includes search options with descriptions", () => {
            const script = generateFishCompletion();
            expect(script).toContain('-l limit -d "Maximum');
            expect(script).toContain('-l project -d "Filter by');
            expect(script).toContain('-l json -d "Output as');
        });

        it("bash includes role choices", () => {
            const script = generateBashCompletion();
            expect(script).toContain("user assistant");
        });

        it("zsh includes role choices", () => {
            const script = generateZshCompletion();
            expect(script).toContain(":role:(user assistant)");
        });

        it("fish includes role choices", () => {
            const script = generateFishCompletion();
            expect(script).toContain('-a "user assistant"');
        });

        it("bash includes sort choices", () => {
            const script = generateBashCompletion();
            expect(script).toContain("recent oldest largest");
        });

        it("zsh includes sort choices", () => {
            const script = generateZshCompletion();
            expect(script).toContain(":order:(recent oldest largest)");
        });

        it("fish includes sort choices", () => {
            const script = generateFishCompletion();
            expect(script).toContain('-a "recent oldest largest"');
        });
    });
});
