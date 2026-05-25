/**
 * CLI Commands
 *
 * Command handlers for the memory CLI.
 */

export type { CommandResult } from "../command-result.js";

export { createSyncCommand, executeSyncCommand } from "./sync/index.js";
export { createSearchCommand, executeSearchCommand } from "./search.js";
export { createListCommand, executeListCommand } from "./list.js";
export { createStatsCommand, executeStatsCommand } from "./stats.js";
export { createContextCommand, executeContextCommand } from "./context.js";
export { createRelatedCommand, executeRelatedCommand } from "./related.js";
export { createShowCommand, executeShowCommand } from "./show.js";
export { createBrowseCommand, executeBrowseCommand } from "./browse.js";
export { createQueryCommand, executeQueryCommand } from "./query.js";

// Hook management commands
export { createInstallCommand, executeInstallCommand } from "./install.js";
export { createUninstallCommand, executeUninstallCommand } from "./uninstall.js";
export { createStatusCommand, executeStatusCommand } from "./status.js";

// Diagnostic commands
export { createDoctorCommand, executeDoctorCommand } from "./doctor.js";

// Maintenance commands
export { createPurgeCommand, executePurgeCommand } from "./purge.js";
export { createMigrateCommand, executeMigrateCommand } from "./migrate.js";

// Backup commands
export { createExportCommand, executeExportCommand } from "./export.js";
export { createImportCommand, executeImportCommand } from "./import.js";

// Shell completion
export { createCompletionCommand, executeCompletionCommand } from "./completion.js";

// Friction commands
export { createFrictionCommand, executeFrictionCommand } from "./friction/index.js";

// Backfill commands
export { createBackfillCommand, executeBackfillCommand } from "./backfill.js";

// Fact extraction commands
export { createExtractCommand, executeExtractCommand } from "./extract.js";
export { createFactsCommand, executeFactsCommand } from "./facts.js";

// Option types for programmatic API consumers
export type { SyncCommandOptions } from "./sync/index.js";
export type { EmbeddingPassDeps, BackgroundModeDeps } from "./sync/index.js";
export type { SearchCommandOptions } from "./search.js";
export type { ListCommandOptions } from "./list.js";
export type { StatsCommandOptions } from "./stats.js";
export type { ContextCommandOptions } from "./context.js";
export type { RelatedCommandOptions } from "./related.js";
export type { ShowCommandOptions } from "./show.js";
export type { QueryCommandOptions } from "./query.js";
export type { BrowseCommandOptions } from "./browse.js";
export type { InstallOptions } from "./install.js";
export type { UninstallOptions } from "./uninstall.js";
export type { DoctorOptions } from "./doctor.js";
export type { PurgeCommandOptions, PurgeResult } from "./purge.js";
export type { ExportOptions } from "./export.js";
export type { ImportOptions } from "./import.js";
export type { ShellType } from "./completion.js";
export type { StatusOptions, StatusInfo, EmbeddingStatus, GatherStatusOptions } from "./status.js";
export type {
  FrictionCommandOptions,
  FrictionLogOptions,
  FrictionListOptions,
  FrictionResolveOptions,
  FrictionExecuteOptions,
} from "./friction/index.js";
export type {
  BackfillCommandOptions,
  BackfillServiceDeps,
} from "./backfill.js";
export type { MigrateCommandOptions } from "./migrate.js";
