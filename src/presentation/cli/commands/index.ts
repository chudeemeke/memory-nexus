/**
 * CLI Commands
 *
 * Command handlers for the memory-nexus CLI.
 */

export { createSyncCommand, executeSyncCommand } from "./sync.js";
export { createSearchCommand, executeSearchCommand } from "./search.js";
export { createListCommand, executeListCommand } from "./list.js";
export { createStatsCommand, executeStatsCommand } from "./stats.js";
export { createContextCommand, executeContextCommand } from "./context.js";
export { createRelatedCommand, executeRelatedCommand } from "./related.js";
export { createShowCommand, executeShowCommand } from "./show.js";
export { createBrowseCommand, executeBrowseCommand } from "./browse.js";

// Hook management commands
export { createInstallCommand, executeInstallCommand } from "./install.js";
export { createUninstallCommand, executeUninstallCommand } from "./uninstall.js";
export { createStatusCommand, executeStatusCommand } from "./status.js";

// Diagnostic commands
export { createDoctorCommand, executeDoctorCommand } from "./doctor.js";

// Maintenance commands
export { createPurgeCommand, executePurgeCommand } from "./purge.js";

// Backup commands
export { createExportCommand, executeExportCommand } from "./export.js";
export { createImportCommand, executeImportCommand } from "./import.js";

// Shell completion
export { createCompletionCommand, executeCompletionCommand } from "./completion.js";
