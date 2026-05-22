/**
 * Sync Ambient Context
 *
 * Generates ambient context files for the current project after
 * memory file sync. Writes context.md and updates MEMORY.md in the
 * current project's Claude Code auto memory directory.
 */

import type { initializeDatabase } from "../../../../infrastructure/database/index.js";
import type { SyncCommandOptions, AmbientContextDeps } from "./types.js";

/**
 * Generate ambient context files for the current project.
 *
 * Runs after memory file sync. Writes context.md and updates MEMORY.md
 * in the current project's Claude Code auto memory directory.
 *
 * Failure is non-fatal: logs error and continues sync.
 *
 * @param db Database connection
 * @param options Sync command options
 * @param deps Optional dependency overrides for testing
 */
export async function runAmbientContextGeneration(
  db: ReturnType<typeof initializeDatabase>["db"],
  options: SyncCommandOptions,
  deps?: AmbientContextDeps,
): Promise<void> {
  try {
    // Load config (lazy -- only when ambient context is needed)
    let config: { ambientContext: { enabled: boolean; budget: number } };
    let autoMemoryDir: string;
    let projectName: string;
    let ambientService: { generateAmbientContext: (opts: any) => Promise<{ success: boolean; contextTokens?: number; reason?: string }> };

    if (deps) {
      // Testing path: use injected deps
      config = deps.loadConfig();
      if (!config.ambientContext.enabled) {
        return;
      }
      autoMemoryDir = deps.resolveAutoMemoryDir();
      projectName = deps.resolveProjectName();
      ambientService = deps.createAmbientService();
    } else {
      // Production path: lazy imports
      const { loadConfig: configLoader } = await import("../../../../infrastructure/hooks/config-manager.js");
      config = configLoader();

      if (!config.ambientContext.enabled) {
        return;
      }

      const cwd = process.cwd();
      const { ProjectPath } = await import("../../../../domain/value-objects/project-path.js");
      const projectPath = ProjectPath.fromDecoded(cwd);
      const encoded = projectPath.encoded;
      projectName = projectPath.projectName;

      const { homedir } = await import("node:os");
      const { join } = await import("node:path");
      autoMemoryDir = join(homedir(), ".claude", "projects", encoded, "memory");

      const { SqliteProjectResolver } = await import(
        "../../../../infrastructure/database/services/context-service.js"
      );
      const { SqliteMemoryFileRepository } = await import(
        "../../../../infrastructure/database/repositories/memory-file-repository.js"
      );
      const { SqliteFrictionRepository } = await import(
        "../../../../infrastructure/database/repositories/friction-repository.js"
      );
      const { AutoMemoryWriter } = await import(
        "../../../../infrastructure/hooks/auto-memory-writer.js"
      );
      const { SmartContextService } = await import(
        "../../../../application/services/smart-context-service.js"
      );
      const { AmbientContextService } = await import(
        "../../../../application/services/ambient-context-service.js"
      );
      const { createContextFormatter } = await import(
        "../../formatters/context-formatter.js"
      );

      const projectResolver = new SqliteProjectResolver(db);
      const memoryFileRepo = new SqliteMemoryFileRepository(db);
      const frictionRepo = new SqliteFrictionRepository(db);
      const formatter = createContextFormatter("ai", false);

      const smartContext = new SmartContextService({
        projectResolver,
        memoryFileRepo,
        frictionRepo,
      });

      ambientService = new AmbientContextService(
        smartContext,
        new AutoMemoryWriter(),
        formatter as { formatSmartContext(result: any): string },
      );
    }

    const result = await ambientService.generateAmbientContext({
      projectName,
      autoMemoryDir,
      budget: config.ambientContext.budget,
    });

    if (result.success && !options.quiet) {
      console.log(`  Ambient context: updated (~${result.contextTokens} tokens)`);
    } else if (!result.success && !options.quiet) {
      console.log(`  Ambient context: skipped (${result.reason})`);
    }
  } catch (error) {
    // Non-fatal: ambient context generation should never fail the sync
    if (!options.quiet) {
      console.error(
        `  Ambient context: error (${error instanceof Error ? error.message : String(error)})`
      );
    }
  }
}
