/**
 * Sync Embedding Pass
 *
 * Handles embedding generation after sync completes.
 * Lazy-loads embedding infrastructure to avoid ONNX runtime overhead
 * when --embed is not used.
 */

import type { initializeDatabase } from "../../../../infrastructure/database/index.js";
import type { ModelState } from "../../../../application/services/index.js";
import type { SyncCommandOptions, EmbeddingPassDeps } from "./types.js";
import { loadFactory, loadConfig, loadRepository } from "./helpers.js";

/**
 * Run the embedding pass after sync completes.
 *
 * Lazy-loads embedding infrastructure to avoid ONNX runtime overhead
 * when --embed is not used. All embedding modules are dynamically imported.
 *
 * @param db Database connection
 * @param options Sync command options
 * @param deps Optional dependency overrides for testing
 */
export async function runEmbeddingPass(
  db: ReturnType<typeof initializeDatabase>["db"],
  options: SyncCommandOptions,
  deps: EmbeddingPassDeps = {},
): Promise<void> {
  // Load dependencies (lazy import for production, overrides for testing)
  const factory = deps.factory ?? await loadFactory();
  const config = deps.config ?? await loadConfig();
  const provider = factory.createFromConfig(config);

  if (!provider) {
    if (!options.quiet) {
      console.error("Embedding is disabled in configuration. Enable it in ~/.config/memory/config.json");
    }
    return;
  }

  // Create repository (override for testing, real for production)
  const repository = deps.repositoryOverride ?? await loadRepository(db);

  const { EmbeddingService } = await import(
    "../../../../application/services/embedding-service.js"
  );
  const { PatternRedactor } = await import(
    "../../../../infrastructure/security/pattern-redactor.js"
  );
  const { createEmbeddingProgressReporter, createModelDownloadHandler } = await import(
    "../../progress-reporter.js"
  );

  const service = new EmbeddingService({
    repository,
    provider,
    config: config.embedding,
    redactor: new PatternRedactor(),
  });

  // Check for model change
  const modelState = service.checkModelState();
  if (modelState.modelChanged && modelState.needsReEmbed) {
    const proceed = await handleModelChange(modelState, options);
    if (!proceed) {
      await factory.dispose();
      return;
    }

    // Check for dimension change -- requires vec0 table recreation
    const storedDimensions = repository.getStoredEmbeddingDimensions();
    const newDimensions = config.embedding.dimensions;
    if (storedDimensions !== null && storedDimensions !== newDimensions) {
      if (!options.quiet) {
        console.log(`Recreating embedding table for ${newDimensions}-dimensional vectors...`);
      }
      repository.recreateVecTable(newDimensions);
    }

    if (!options.quiet) {
      console.log("Clearing existing embeddings for re-embedding...");
    }
  }

  // Initialize provider (triggers model download on first run)
  const downloadHandler = createModelDownloadHandler({ quiet: !!options.quiet });
  await provider.initialize(downloadHandler);

  // Calculate how many messages need embedding
  const totalToEmbed = repository.getTotalMessageCount() - repository.getEmbeddedCount();

  if (totalToEmbed === 0) {
    if (!options.quiet) {
      console.log("\nAll messages already embedded.");
    }
    await factory.dispose();
    return;
  }

  // Run embedding pass with progress
  const embeddingReporter = createEmbeddingProgressReporter({ quiet: !!options.quiet });
  embeddingReporter.start(totalToEmbed);

  try {
    let result;
    if (modelState.modelChanged && modelState.needsReEmbed) {
      result = await service.clearAndReembed({
        onProgress: (p) => embeddingReporter.update(p.current),
      });
    } else {
      result = await service.embedUnembedded({
        onProgress: (p) => embeddingReporter.update(p.current),
      });
    }

    embeddingReporter.stop();

    if (!options.quiet) {
      const seconds = Math.max(1, Math.round(result.durationMs / 1000));
      const rate = result.rate.toFixed(1);
      console.log(`\nEmbedded ${result.embedded} messages in ${seconds}s (${rate} msg/s)`);
    }
  } catch (error) {
    embeddingReporter.stop();
    const embeddedSoFar = repository.getEmbeddedCount();
    const total = repository.getTotalMessageCount();
    if (!options.quiet) {
      console.error(
        `\nEmbedding failed at ${embeddedSoFar}/${total} messages. ` +
        `Run memory sync --embed to resume from where it stopped.`
      );
    }
    throw error;
  } finally {
    await factory.dispose();
  }
}

/**
 * Handle model change detection with user confirmation.
 *
 * Uses human-readable model names from ModelState for prompts.
 * Auto-confirms with --force, skips in non-interactive mode.
 *
 * @param modelState Model state comparison result
 * @param options Sync command options
 * @returns true if embedding should proceed, false to skip
 */
export async function handleModelChange(
  modelState: ModelState,
  options: SyncCommandOptions,
): Promise<boolean> {
  const count = modelState.embeddedCount ?? 0;
  // Use human-readable model names (fall back to hash only for legacy data)
  const fromModel = modelState.storedModelName ?? modelState.storedHash ?? "unknown";
  const toModel = modelState.currentModelName;

  // --force: auto-confirm
  if (options.force) {
    return true;
  }

  // Non-interactive: skip with warning
  if (!process.stdin.isTTY || options.quiet) {
    console.error(
      `Model changed from ${fromModel} to ${toModel}. ` +
      `Skipping re-embedding in non-interactive mode. ` +
      `Run 'memory sync --embed' interactively to re-embed.`
    );
    return false;
  }

  // Interactive prompt
  const readline = await import("node:readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(
      `Model changed from ${fromModel} to ${toModel}. ` +
      `Re-embed all ${count} messages? [y/N] `,
      (answer: string) => {
        rl.close();
        resolve(answer.trim().toLowerCase() === "y");
      }
    );
  });
}
