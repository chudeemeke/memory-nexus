/**
 * OpenAI Embedding Provider
 *
 * Infrastructure adapter implementing IEmbeddingProvider using the
 * OpenAI embeddings API. Communicates via native fetch() -- no npm
 * dependencies required.
 *
 * Key design decisions:
 * - No API health check during initialize(): mark ready immediately
 *   to avoid blocking on network calls during startup.
 * - Single-request batch: OpenAI accepts array input, returns indexed
 *   data[] that we sort by index for deterministic ordering.
 * - Error messages include HTTP status for programmatic handling.
 */

import type {
    IEmbeddingProvider,
    DownloadProgress,
} from "../../domain/ports/embedding.js";
import { EmbeddingResult } from "../../domain/value-objects/embedding-result.js";

interface OpenAiProviderOptions {
    apiKey: string;
    model?: string | undefined;
    dimensions?: number | undefined;
    baseUrl?: string | undefined;
}

export class OpenAiProvider implements IEmbeddingProvider {
    readonly name = "openai";
    readonly model: string;
    readonly dimensions: number;

    private readonly apiKey: string;
    private readonly baseUrl: string;
    private _ready = false;

    constructor(options: OpenAiProviderOptions) {
        this.apiKey = options.apiKey;
        this.model = options.model ?? "text-embedding-3-small";
        this.dimensions = options.dimensions ?? 1536;
        this.baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
    }

    async initialize(
        _onProgress?: (progress: DownloadProgress) => void,
    ): Promise<void> {
        // No API call -- mark ready immediately per research guidance.
        // Authentication errors surface on first embed() call.
        this._ready = true;
    }

    async embed(text: string): Promise<EmbeddingResult> {
        if (!this._ready) {
            throw new Error(
                "Provider not initialized. Call initialize() before embed().",
            );
        }

        const response = await fetch(`${this.baseUrl}/embeddings`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: this.model,
                input: text,
                dimensions: this.dimensions,
            }),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(
                `OpenAI API error ${response.status}: ${errorBody}`,
            );
        }

        const json = (await response.json()) as {
            data: Array<{ embedding: number[]; index: number }>;
            model: string;
        };

        const firstData = json.data?.[0];
        if (!firstData) {
            throw new Error("OpenAI returned empty embeddings response");
        }

        const embedding = new Float32Array(firstData.embedding);
        return EmbeddingResult.create({
            embedding,
            model: this.model,
            dimensions: this.dimensions,
        });
    }

    async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
        if (!this._ready) {
            throw new Error(
                "Provider not initialized. Call initialize() before embed().",
            );
        }

        const response = await fetch(`${this.baseUrl}/embeddings`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: this.model,
                input: texts,
                dimensions: this.dimensions,
            }),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(
                `OpenAI API error ${response.status}: ${errorBody}`,
            );
        }

        const json = (await response.json()) as {
            data: Array<{ embedding: number[]; index: number }>;
            model: string;
        };

        // Sort by index to ensure deterministic ordering
        const sorted = [...json.data].sort((a, b) => a.index - b.index);

        return sorted.map((item) =>
            EmbeddingResult.create({
                embedding: new Float32Array(item.embedding),
                model: this.model,
                dimensions: this.dimensions,
            }),
        );
    }

    isReady(): boolean {
        return this._ready;
    }

    async dispose(): Promise<void> {
        this._ready = false;
    }
}
