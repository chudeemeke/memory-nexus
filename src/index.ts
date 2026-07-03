/**
 * @chude/memory
 *
 * Cross-project context persistence for Claude Code sessions.
 *
 * This module exports:
 * - Domain layer: entities, value objects, services, errors
 * - Application layer: use cases and application services
 * - Presentation API: execute*Command functions for programmatic use
 */

// Domain and application layers
export * from "./domain/index.js";
export * from "./application/index.js";

// Programmatic API: execute*Command functions
export {
  executeSyncCommand,
  executeSearchCommand,
  executeListCommand,
  executeStatsCommand,
  executeContextCommand,
  executeRelatedCommand,
  executeShowCommand,
  executeBrowseCommand,
  executeQueryCommand,
  executeInstallCommand,
  executeUninstallCommand,
  executeStatusCommand,
  executeDoctorCommand,
  executeAuditSecretsCommand,
  executePurgeCommand,
  executeMigrateCommand,
  executeExportCommand,
  executeImportCommand,
  executeBackupCreateCommand,
  executeBackupVerifyCommand,
  executeRestoreCommand,
  executeProjectionsRebuildCommand,
  executeCompletionCommand,
  executeFrictionCommand,
  executeDreamCommand,
} from "./presentation/cli/commands/index.js";

// Programmatic API: result and option types
export type { CommandResult } from "./presentation/cli/commands/index.js";
export type {
  SyncCommandOptions,
  EmbeddingPassDeps,
  BackgroundModeDeps,
  SearchCommandOptions,
  ListCommandOptions,
  StatsCommandOptions,
  ContextCommandOptions,
  RelatedCommandOptions,
  ShowCommandOptions,
  QueryCommandOptions,
  BrowseCommandOptions,
  InstallOptions,
  UninstallOptions,
  DoctorOptions,
  AuditSecretsOptions,
  PurgeCommandOptions,
  PurgeResult,
  ExportOptions,
  ImportOptions,
  LocalBackupCommandOptions,
  LocalBackupCliOptions,
  ProjectionCommandOptions,
  ProjectionCliOptions,
  ShellType,
  StatusInfo,
  EmbeddingStatus,
  StatusOptions,
  GatherStatusOptions,
  FrictionCommandOptions,
  FrictionLogOptions,
  FrictionListOptions,
  FrictionResolveOptions,
  FrictionExecuteOptions,
  DreamAction,
  DreamCommandDeps,
  DreamCommandOptions,
} from "./presentation/cli/commands/index.js";
