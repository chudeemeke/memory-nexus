/**
 * Friction Command Types
 *
 * Type definitions and interfaces for friction command handlers.
 */

/**
 * Function type for opening a file in the system browser.
 */
export type BrowserOpener = (filePath: string) => void;

/**
 * Runtime dependencies for executeFrictionCommand.
 *
 * Operational dependencies that tests substitute for isolation.
 * Defaults to production resolution when omitted.
 */
export interface FrictionCommandDeps {
    /** Database path. Defaults to getDefaultDbPath(). */
    dbPath?: string;
    /** Browser opener for --html mode. Defaults to system default. */
    openInBrowser?: BrowserOpener;
}

/**
 * Base options shared by all friction subcommands.
 */
export interface FrictionCommandOptions {
    json?: boolean;
    /** Output format: default or ai */
    format?: "default" | "ai";
}

/**
 * Options for the friction log subcommand.
 */
export interface FrictionLogOptions extends FrictionCommandOptions {
    severity?: string;
    category?: string;
    source?: string;
    context?: string;
    tool?: string;
}

/**
 * Options for the friction list subcommand.
 */
export interface FrictionListOptions extends FrictionCommandOptions {
    all?: boolean;
    status?: string;
    category?: string;
    tool?: string;
    limit?: string;
}

/**
 * Options for the friction resolve/wont-fix subcommands.
 */
export interface FrictionResolveOptions extends FrictionCommandOptions {
    resolution: string;
}

/**
 * Options for the friction purge subcommand.
 */
export interface FrictionPurgeOptions extends FrictionCommandOptions {
    dryRun?: boolean;
    force?: boolean;
}

/**
 * Options passed to executeFrictionCommand.
 */
export interface FrictionExecuteOptions {
    action: "log" | "list" | "resolve" | "wont-fix" | "dashboard" | "purge";
    description?: string;
    pattern?: string;
    id?: string;
    json?: boolean;
    /** Output format: default or ai */
    format?: "default" | "ai";
    severity?: string;
    category?: string;
    source?: string;
    context?: string;
    all?: boolean;
    status?: string;
    limit?: string;
    resolution?: string;
    tool?: string;
    html?: boolean;
    dryRun?: boolean;
    force?: boolean;
}
