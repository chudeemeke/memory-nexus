/**
 * EmbeddingProviderFactory Tests
 *
 * Tests for the factory that creates embedding providers from config,
 * caches instances, and supports disposal.
 */

import { describe, expect, test, beforeEach } from "bun:test";
import { EmbeddingProviderFactory } from "./embedding-provider-factory.js";
import { TransformersJsProvider } from "./transformers-js-provider.js";
import type { EmbeddingConfigData } from "../hooks/config-manager.js";
import { DEFAULT_EMBEDDING_CONFIG } from "../hooks/config-manager.js";

describe("EmbeddingProviderFactory", () => {
    let factory: EmbeddingProviderFactory;

    beforeEach(() => {
        factory = new EmbeddingProviderFactory();
    });

    describe("create()", () => {
        test("returns a TransformersJsProvider for 'local' provider", () => {
            const config: EmbeddingConfigData = {
                enabled: true,
                provider: "local",
                model: "Xenova/all-MiniLM-L6-v2",
                dimensions: 384,
            };

            const provider = factory.create(config);
            expect(provider).toBeInstanceOf(TransformersJsProvider);
        });

        test("returned provider has correct name, model, and dimensions", () => {
            const config: EmbeddingConfigData = {
                enabled: true,
                provider: "local",
                model: "Xenova/all-MiniLM-L6-v2",
                dimensions: 384,
            };

            const provider = factory.create(config);
            expect(provider.name).toBe("transformers-js");
            expect(provider.model).toBe("Xenova/all-MiniLM-L6-v2");
            expect(provider.dimensions).toBe(384);
        });

        test("returned provider is NOT initialized", () => {
            const config: EmbeddingConfigData = {
                enabled: true,
                provider: "local",
                model: "Xenova/all-MiniLM-L6-v2",
                dimensions: 384,
            };

            const provider = factory.create(config);
            expect(provider.isReady()).toBe(false);
        });

        test("returns the same instance for same config (cached)", () => {
            const config: EmbeddingConfigData = {
                enabled: true,
                provider: "local",
                model: "Xenova/all-MiniLM-L6-v2",
                dimensions: 384,
            };

            const provider1 = factory.create(config);
            const provider2 = factory.create(config);
            expect(provider1).toBe(provider2);
        });

        test("returns different instances for different models", () => {
            const config1: EmbeddingConfigData = {
                enabled: true,
                provider: "local",
                model: "Xenova/all-MiniLM-L6-v2",
                dimensions: 384,
            };
            const config2: EmbeddingConfigData = {
                enabled: true,
                provider: "local",
                model: "Xenova/paraphrase-MiniLM-L3-v2",
                dimensions: 384,
            };

            const provider1 = factory.create(config1);
            const provider2 = factory.create(config2);
            expect(provider1).not.toBe(provider2);
        });

        test("throws for unsupported provider", () => {
            const config: EmbeddingConfigData = {
                enabled: true,
                provider: "unknown",
                model: "some-model",
                dimensions: 768,
            };

            expect(() => factory.create(config)).toThrow(
                'Unsupported embedding provider: "unknown". Supported: local'
            );
        });
    });

    describe("dispose()", () => {
        test("disposes all cached providers", async () => {
            const config: EmbeddingConfigData = {
                enabled: true,
                provider: "local",
                model: "Xenova/all-MiniLM-L6-v2",
                dimensions: 384,
            };

            const provider = factory.create(config);
            // Provider is not initialized so dispose is a no-op, but verify no error
            await factory.dispose();

            // After dispose, create() returns a fresh instance
            const newProvider = factory.create(config);
            expect(newProvider).not.toBe(provider);
        });

        test("after dispose, create() returns fresh instances", async () => {
            const config: EmbeddingConfigData = {
                enabled: true,
                provider: "local",
                model: "Xenova/all-MiniLM-L6-v2",
                dimensions: 384,
            };

            const original = factory.create(config);
            await factory.dispose();

            const fresh = factory.create(config);
            expect(fresh).not.toBe(original);
        });
    });

    describe("createFromConfig()", () => {
        test("reads embedding section from config and creates provider", () => {
            const memoryConfig = {
                embedding: {
                    enabled: true,
                    provider: "local",
                    model: "Xenova/all-MiniLM-L6-v2",
                    dimensions: 384,
                },
            };

            const provider = factory.createFromConfig(memoryConfig);
            expect(provider).not.toBeNull();
            expect(provider).toBeInstanceOf(TransformersJsProvider);
        });

        test("uses default embedding config when embedding is undefined", () => {
            const provider = factory.createFromConfig({});
            expect(provider).not.toBeNull();
            expect(provider!.model).toBe(DEFAULT_EMBEDDING_CONFIG.model);
            expect(provider!.dimensions).toBe(DEFAULT_EMBEDDING_CONFIG.dimensions);
        });

        test("returns null when embedding.enabled is false", () => {
            const memoryConfig = {
                embedding: {
                    enabled: false,
                    provider: "local",
                    model: "Xenova/all-MiniLM-L6-v2",
                    dimensions: 384,
                },
            };

            const provider = factory.createFromConfig(memoryConfig);
            expect(provider).toBeNull();
        });
    });
});
