/**
 * Sync Ambient Context
 *
 * Generates ambient context files for the current project after
 * memory file sync. Writes context.md and updates MEMORY.md in the
 * current project's Claude Code auto memory directory.
 */

import type { initializeDatabase } from "../../../../infrastructure/database/index.js";
import type { SyncCommandOptions, AmbientContextDeps } from "./types.js";
import { unknownErrorMessage } from "../../../../domain/errors/unknown-error.js";

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

      ambientService = await createDefaultAmbientService(db);
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
        `  Ambient context: error (${unknownErrorMessage(error)})`
      );
    }
  }
}

export async function createDefaultAmbientService(
  db: ReturnType<typeof initializeDatabase>["db"],
): Promise<{ generateAmbientContext: (opts: any) => Promise<{ success: boolean; contextTokens?: number; reason?: string }> }> {
  const { SqliteProjectResolver } = await import(
    "../../../../infrastructure/database/services/context-service.js"
  );
  const { SqliteFactRepository } = await import(
    "../../../../infrastructure/database/repositories/fact-repository.js"
  );
  const { SqliteFrictionRepository } = await import(
    "../../../../infrastructure/database/repositories/friction-repository.js"
  );
  const { SqlitePersonaRepository } = await import(
    "../../../../infrastructure/database/repositories/persona-repository.js"
  );
  const { SqliteGraphRepository } = await import(
    "../../../../infrastructure/database/repositories/graph-repository.js"
  );
  const { SqliteMemoryGovernanceRepository } = await import(
    "../../../../infrastructure/database/repositories/memory-governance-repository.js"
  );
  const { SqliteMemoryUtilityRepository } = await import(
    "../../../../infrastructure/database/repositories/memory-utility-repository.js"
  );
  const { AutoMemoryWriter } = await import(
    "../../../../infrastructure/hooks/auto-memory-writer.js"
  );
  const { SmartContextService } = await import(
    "../../../../application/services/smart-context-service.js"
  );
  const { MemoryGovernanceService } = await import(
    "../../../../application/services/memory-governance-service.js"
  );
  const { MemoryRankingService } = await import(
    "../../../../application/services/memory-ranking-service.js"
  );
  const { AmbientContextService } = await import(
    "../../../../application/services/ambient-context-service.js"
  );
  const { createContextFormatter } = await import(
    "../../formatters/context-formatter.js"
  );

  const governanceRepo = new SqliteMemoryGovernanceRepository(db);
  const smartContext = new SmartContextService({
    projectResolver: new SqliteProjectResolver(db),
    factRepo: new SqliteFactRepository(db),
    frictionRepo: new SqliteFrictionRepository(db),
    personaRepo: new SqlitePersonaRepository(db),
    graphRepo: new SqliteGraphRepository(db),
    governancePolicy: new MemoryGovernanceService({ repository: governanceRepo }),
    rankingService: new MemoryRankingService(),
    utilityRepo: new SqliteMemoryUtilityRepository(db),
  });
  const formatter = createContextFormatter("ai", false);

  return new AmbientContextService(
    smartContext,
    new AutoMemoryWriter(),
    formatter as { formatSmartContext(result: any): string },
  );
}
