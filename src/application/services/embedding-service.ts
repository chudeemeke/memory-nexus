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

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
    isEmbeddingProviderError,
    type IEmbeddingProvider,
} from "../../domain/ports/embedding.js";
import type { IRedactor } from "../../domain/ports/redactor.js";
import type {
    IEmbeddingRepository,
    EmbeddingBatchItem,
    EmbeddingServiceConfig,
    UnembeddedMessage,
} from "../../domain/ports/repositories.js";

const DEFAULT_MAX_BATCH_BYTES = 800_000;

const NOOP_REDACTOR: IRedactor = {
    redactText: (input) => ({ text: input, findings: [] }),
    redactJson: (input) => ({ value: input, findings: [] }),
};

interface PreparedEmbeddingInput {
    rowid: number;
    rawContent: string;
    text: string;
}

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
    private readonly maxBatchBytes: number;
    private readonly modelHash: string;
    private readonly modelName: string;
    private readonly redactor: IRedactor;

    constructor(deps: {
        repository: IEmbeddingRepository;
        provider: IEmbeddingProvider;
        config: EmbeddingServiceConfig;
        redactor?: IRedactor;
    }) {
        this.repository = deps.repository;
        this.provider = deps.provider;
        this.batchSize = deps.config.batchSize;
        this.maxBatchBytes = Math.max(
            1,
            deps.config.maxBatchBytes ?? DEFAULT_MAX_BATCH_BYTES,
        );
        this.modelHash = computeModelHash(deps.config);
        this.modelName = deps.config.model;
        this.redactor = deps.redactor ?? NOOP_REDACTOR;
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
        let skipped = 0;

        // Get total count of unembedded messages for progress reporting
        const totalUnembedded = Math.max(
            0,
            this.repository.getTotalMessageCount() -
                this.repository.getEmbeddedCount() -
                this.getSkippedCountForCurrentModel(),
        );

        if (totalUnembedded <= 0) {
            return { embedded: 0, skipped: 0, durationMs: 0, rate: 0 };
        }

        // Process in batches
        let batch = this.repository.findUnembedded(this.batchSize, this.modelHash);
        while (batch.length > 0) {
            const preparedBatch = this.prepareBatch(batch);
            const chunks = this.chunkByPayloadBytes(preparedBatch);

            for (const chunk of chunks) {
                const result = await this.embedChunk(chunk);
                embedded += result.embedded;
                skipped += result.skipped;
                options.onProgress?.({
                    current: Math.min(embedded + skipped, totalUnembedded),
                    total: totalUnembedded,
                });
            }

            // Get next batch
            batch = this.repository.findUnembedded(this.batchSize, this.modelHash);
        }

        const durationMs = Date.now() - startTime;
        const rate = durationMs > 0 ? embedded / (durationMs / 1000) : 0;

        return { embedded, skipped, durationMs, rate };
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

    private prepareBatch(batch: UnembeddedMessage[]): PreparedEmbeddingInput[] {
        return batch.map((message) => ({
            rowid: message.rowid,
            rawContent: message.content,
            text: this.redactor.redactText(message.content).text,
        }));
    }

    private chunkByPayloadBytes(
        inputs: PreparedEmbeddingInput[],
    ): PreparedEmbeddingInput[][] {
        const chunks: PreparedEmbeddingInput[][] = [];
        let current: PreparedEmbeddingInput[] = [];

        for (const input of inputs) {
            const candidate = [...current, input];
            if (
                current.length > 0 &&
                this.estimatePayloadBytes(candidate) > this.maxBatchBytes
            ) {
                chunks.push(current);
                current = [input];
                continue;
            }

            current = candidate;
        }

        if (current.length > 0) {
            chunks.push(current);
        }

        return chunks;
    }

    private estimatePayloadBytes(inputs: PreparedEmbeddingInput[]): number {
        return Buffer.byteLength(
            JSON.stringify({
                model: this.modelName,
                input: inputs.map((input) => input.text),
            }),
            "utf8",
        );
    }

    private async embedChunk(
        chunk: PreparedEmbeddingInput[],
    ): Promise<{ embedded: number; skipped: number }> {
        try {
            const results = await this.provider.embedBatch(
                chunk.map((input) => input.text),
            );

            const items: EmbeddingBatchItem[] = chunk.map((input, i) => ({
                rowid: input.rowid,
                embedding: results[i]!.embedding,
            }));
            this.repository.storeBatch(items, this.modelHash, this.modelName);
            return { embedded: chunk.length, skipped: 0 };
        } catch (error) {
            if (!isEmbeddingProviderError(error, "payload_too_large")) {
                throw error;
            }

            if (chunk.length > 1) {
                const midpoint = Math.ceil(chunk.length / 2);
                const left = await this.embedChunk(chunk.slice(0, midpoint));
                const right = await this.embedChunk(chunk.slice(midpoint));
                return {
                    embedded: left.embedded + right.embedded,
                    skipped: left.skipped + right.skipped,
                };
            }

            this.markPayloadTooLargeSkip(chunk[0]!);
            return { embedded: 0, skipped: 1 };
        }
    }

    private markPayloadTooLargeSkip(input: PreparedEmbeddingInput): void {
        this.repository.markSkipped({
            messageId: input.rowid,
            modelHash: this.modelHash,
            modelName: this.modelName,
            provider: this.provider.name,
            reason: "payload_too_large",
            retryable: false,
            contentHash: createHash("sha256").update(input.rawContent).digest("hex"),
            contentBytes: Buffer.byteLength(input.rawContent, "utf8"),
            safeError:
                "Provider payload exceeded request limit for this message and model.",
        });
    }

    private getSkippedCountForCurrentModel(): number {
        return typeof this.repository.getSkippedCount === "function"
            ? this.repository.getSkippedCount(this.modelHash)
            : 0;
    }
}
