/**
 * EmbeddingProviderFactory
 *
 * Creates embedding providers from configuration. Caches provider instances
 * to avoid redundant resource allocation. The factory does NOT call
 * initialize() -- the caller controls when the ONNX runtime loads.
 *
 * Supported providers:
 * - "local" -> TransformersJsProvider
 * - "openai" -> OpenAiProvider
 * - "ollama" -> OllamaProvider
 */

import type { IEmbeddingProvider } from "../../domain/ports/embedding.js";
import type { EmbeddingConfigData } from "../hooks/config-manager.js";
import { createHash } from "node:crypto";
import { DEFAULT_EMBEDDING_CONFIG } from "../hooks/config-manager.js";
import { createEmbeddingProvider } from "../providers/provider-registry.js";

export class EmbeddingProviderFactory {
    private cache = new Map<string, IEmbeddingProvider>();

    /**
     * Generate a cache key from embedding config.
     */
    private cacheKey(config: EmbeddingConfigData): string {
        const apiKeyFingerprint = config.apiKey
            ? createHash("sha256").update(config.apiKey).digest("hex").slice(0, 16)
            : "";
        return [
            config.provider,
            config.model,
            String(config.dimensions),
            config.baseUrl ?? "",
            config.apiKeyEnv ?? "",
            config.apiKeyRef ?? "",
            apiKeyFingerprint,
        ].join(":");
    }

    /**
     * Create an embedding provider from config.
     *
     * The returned provider is NOT initialized -- call initialize()
     * before embed(). Repeated calls with the same config return the
     * cached instance.
     *
     * @throws Error if provider type is unsupported
     */
    create(config: EmbeddingConfigData): IEmbeddingProvider {
        const key = this.cacheKey(config);
        const cached = this.cache.get(key);
        if (cached) return cached;

        const provider = createEmbeddingProvider(config);

        this.cache.set(key, provider);
        return provider;
    }

    /**
     * Create an embedding provider from a MemoryConfig object.
     *
     * Reads the embedding section and delegates to create().
     * Returns null if embedding is disabled.
     */
    createFromConfig(memoryConfig: { embedding?: EmbeddingConfigData }): IEmbeddingProvider | null {
        const embeddingConfig = memoryConfig.embedding ?? DEFAULT_EMBEDDING_CONFIG;
        if (!embeddingConfig.enabled) return null;
        return this.create(embeddingConfig);
    }

    /**
     * Dispose all cached providers and clear the cache.
     */
    async dispose(): Promise<void> {
        for (const provider of this.cache.values()) {
            await provider.dispose();
        }
        this.cache.clear();
    }
}
