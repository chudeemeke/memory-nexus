/**
 * Embedding Service
 *
 * Application layer service that orchestrates the embedding pipeline:
 * check model hash -> query unembedded -> batch embed -> store results.
 *
 * Does NOT own the IEmbeddingProvider lifecycle -- the caller creates
 * and initializes the provider, then passes it in via constructor.
 *
 * Sits between the presentation layer (sync command) and infrastructure
 * (repository + provider). Respects hexagonal architecture boundaries.
 */

import { createHash } from "node:crypto";
import type { IEmbeddingProvider } from "../../domain/ports/embedding.js";
import type { IEmbeddingRepository, EmbeddingBatchItem, EmbeddingServiceConfig } from "../../domain/ports/repositories.js";

/**
 * Options for embedding operations.
 */
export interface EmbedOptions {
    /** Callback invoked after each batch completes */
    onProgress?: (progress: EmbedProgress) => void;
}

/**
 * Progress report after each embedding batch.
 */
export interface EmbedProgress {
    /** Number of messages embedded so far */
    current: number;
    /** Total number of messages to embed */
    total: number;
}

/**
 * Result of an embedding operation.
 */
export interface EmbedResult {
    /** Number of messages successfully embedded */
    embedded: number;
    /** Number of messages skipped */
    skipped: number;
    /** Total duration in milliseconds */
    durationMs: number;
    /** Embedding rate in messages per second */
    rate: number;
}

/**
 * Model state comparison result.
 *
 * Used to detect model changes and determine whether re-embedding
 * is needed. Carries human-readable model names for user prompts.
 */
export interface ModelState {
    /** Whether the configured model differs from the stored model */
    modelChanged: boolean;
    /** Whether all embeddings need to be regenerated */
    needsReEmbed: boolean;
    /** Hash of the previously-used model (from embedding_state) */
    storedHash?: string;
    /** Hash of the currently-configured model */
    currentHash: string;
    /**
     * Human-readable name of the previously-used model.
     * Falls back to storedHash if the stored name is unavailable (legacy data).
     */
    storedModelName?: string;
    /** Human-readable name of the currently-configured model (from config) */
    currentModelName: string;
    /** Number of existing embeddings (for re-embedding cost estimation) */
    embeddedCount?: number;
}

/**
 * Compute a model hash from embedding configuration.
 *
 * Generates a SHA-256 hash of the "provider:model:dimensions" string,
 * truncated to 16 hex characters. Used for model change detection.
 *
 * @param config Embedding config with provider, model, and dimensions
 * @returns 16-character hex hash string
 */
export function computeModelHash(
    config: Pick<EmbeddingServiceConfig, "provider" | "model" | "dimensions">,
): string {
    const input = `${config.provider}:${config.model}:${config.dimensions}`;
    return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

/**
 * Application service for embedding orchestration.
 *
 * Manages the embedding lifecycle: model state detection, batch embedding,
 * progress reporting, and re-embedding on model change. Dependencies are
 * injected via constructor for testability.
 */
export class EmbeddingService {
    private readonly repository: IEmbeddingRepository;
    private readonly provider: IEmbeddingProvider;
    private readonly batchSize: number;
    private readonly modelHash: string;
    private readonly modelName: string;

    constructor(deps: {
        repository: IEmbeddingRepository;
        provider: IEmbeddingProvider;
        config: EmbeddingServiceConfig;
    }) {
        this.repository = deps.repository;
        this.provider = deps.provider;
        this.batchSize = deps.config.batchSize;
        this.modelHash = computeModelHash(deps.config);
        this.modelName = deps.config.model;
    }

    /**
     * Check whether the configured model matches the stored model.
     *
     * Compares the current model hash against what is stored in
     * embedding_state. Returns model state with human-readable names
     * for user-facing prompts.
     *
     * @returns Model state comparison result
     */
    checkModelState(): ModelState {
        const storedHash = this.repository.getStoredModelHash();
        const currentHash = this.modelHash;
        const currentModelName = this.modelName;

        if (storedHash === null) {
            return { modelChanged: false, needsReEmbed: false, currentHash, currentModelName };
        }

        if (storedHash === currentHash) {
            return { modelChanged: false, needsReEmbed: false, currentHash, currentModelName };
        }

        // Model changed -- retrieve stored model name for human-readable prompt
        const storedModelName = this.repository.getStoredModelName() ?? storedHash;

        return {
            modelChanged: true,
            needsReEmbed: true,
            storedHash,
            currentHash,
            storedModelName,
            currentModelName,
            embeddedCount: this.repository.getEmbeddedCount(),
        };
    }

    /**
     * Embed all unembedded messages in batches.
     *
     * Queries for unembedded messages, sends them to the provider in
     * batch-sized chunks, and stores the results. Calls onProgress
     * after each batch completes.
     *
     * @param options Embedding options (progress callback)
     * @returns Summary of the embedding operation
     */
    async embedUnembedded(options: EmbedOptions = {}): Promise<EmbedResult> {
        const startTime = Date.now();
        let embedded = 0;

        // Get total count of unembedded messages for progress reporting
        const totalUnembedded =
            this.repository.getTotalMessageCount() - this.repository.getEmbeddedCount();

        if (totalUnembedded <= 0) {
            return { embedded: 0, skipped: 0, durationMs: 0, rate: 0 };
        }

        // Process in batches
        let batch = this.repository.findUnembedded(this.batchSize);
        while (batch.length > 0) {
            // Embed the batch via provider
            const texts = batch.map((m) => m.content);
            const results = await this.provider.embedBatch(texts);

            // Store results with both hash and human-readable model name
            const items: EmbeddingBatchItem[] = batch.map((msg, i) => ({
                rowid: msg.rowid,
                embedding: results[i]!.embedding,
            }));
            this.repository.storeBatch(items, this.modelHash, this.modelName);

            embedded += batch.length;
            options.onProgress?.({ current: embedded, total: totalUnembedded });

            // Get next batch
            batch = this.repository.findUnembedded(this.batchSize);
        }

        const durationMs = Date.now() - startTime;
        const rate = durationMs > 0 ? embedded / (durationMs / 1000) : 0;

        return { embedded, skipped: 0, durationMs, rate };
    }

    /**
     * Clear all existing embeddings and re-embed everything.
     *
     * Used when the model has changed and all embeddings need
     * to be regenerated. Clears first, then embeds.
     *
     * @param options Embedding options (progress callback)
     * @returns Summary of the re-embedding operation
     */
    async clearAndReembed(options: EmbedOptions = {}): Promise<EmbedResult> {
        this.repository.clearAllEmbeddings();
        return this.embedUnembedded(options);
    }
}
