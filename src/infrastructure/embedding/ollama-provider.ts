/**
 * Ollama Embedding Provider
 *
 * Infrastructure adapter implementing IEmbeddingProvider using the
 * Ollama HTTP API. Communicates via native fetch() -- no npm
 * dependencies required.
 *
 * Key design decisions:
 * - Server reachability check during initialize(): GET /api/tags verifies
 *   the Ollama server is running. Failure throws an actionable error
 *   with recovery instructions.
 * - Single-request batch: Ollama /api/embed accepts array input and
 *   returns embeddings[] in the same order.
 * - Model-not-found detection: 404 responses include a hint to pull
 *   the model via `ollama pull`.
 */

import type {
    IEmbeddingProvider,
    DownloadProgress,
} from "../../domain/ports/embedding.js";
import { EmbeddingResult } from "../../domain/value-objects/embedding-result.js";

interface OllamaProviderOptions {
    model?: string | undefined;
    dimensions?: number | undefined;
    baseUrl?: string | undefined;
}

export class OllamaProvider implements IEmbeddingProvider {
    readonly name = "ollama";
    readonly model: string;
    readonly dimensions: number;

    private readonly baseUrl: string;
    private _ready = false;

    constructor(options?: OllamaProviderOptions) {
        this.model = options?.model ?? "nomic-embed-text";
        this.dimensions = options?.dimensions ?? 768;
        this.baseUrl = options?.baseUrl ?? "http://localhost:11434";
    }

    async initialize(
        _onProgress?: (progress: DownloadProgress) => void,
    ): Promise<void> {
        // Check server reachability via GET /api/tags
        let response: Response;
        try {
            response = await fetch(`${this.baseUrl}/api/tags`, {
                method: "GET",
            });
        } catch (error: unknown) {
            const msg =
                error instanceof Error ? error.message : String(error);
            throw new Error(
                `Cannot reach Ollama server at ${this.baseUrl}. ` +
                    `Ensure Ollama is running: ollama serve (${msg})`,
            );
        }

        if (!response.ok) {
            throw new Error(
                `Ollama server returned ${response.status} from ${this.baseUrl}/api/tags`,
            );
        }

        this._ready = true;
    }

    async embed(text: string): Promise<EmbeddingResult> {
        if (!this._ready) {
            throw new Error(
                "Provider not initialized. Call initialize() before embed().",
            );
        }

        const response = await fetch(`${this.baseUrl}/api/embed`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: this.model,
                input: text,
            }),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            this.throwWithHint(response.status, errorBody);
        }

        const json = (await response.json()) as {
            embeddings: number[][];
        };

        const firstEmbedding = json.embeddings?.[0];
        if (!firstEmbedding) {
            throw new Error("Ollama returned empty embeddings response");
        }

        const embedding = new Float32Array(firstEmbedding);
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

        const response = await fetch(`${this.baseUrl}/api/embed`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: this.model,
                input: texts,
            }),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            this.throwWithHint(response.status, errorBody);
        }

        const json = (await response.json()) as {
            embeddings: number[][];
        };

        return json.embeddings.map((emb) =>
            EmbeddingResult.create({
                embedding: new Float32Array(emb),
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

    /**
     * Throw an error with an actionable hint for model-not-found cases.
     */
    private throwWithHint(status: number, errorBody: string): never {
        const isModelNotFound =
            status === 404 || errorBody.includes("not found");
        if (isModelNotFound) {
            throw new Error(
                `Ollama error ${status}: ${errorBody}. ` +
                    `Model '${this.model}' not found. Run: ollama pull ${this.model}`,
            );
        }
        throw new Error(`Ollama error ${status}: ${errorBody}`);
    }
}
