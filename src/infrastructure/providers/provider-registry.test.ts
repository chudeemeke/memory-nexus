import { describe, expect, test } from "bun:test";
import { OpenAiProvider } from "../embedding/openai-provider.js";
import { OllamaProvider } from "../embedding/ollama-provider.js";
import { TransformersJsProvider } from "../embedding/transformers-js-provider.js";
import { AnthropicExtractionProvider } from "../llm/anthropic-extractor.js";
import { ClaudeCliExtractionProvider } from "../llm/claude-cli-extractor.js";
import { OllamaExtractionProvider } from "../llm/ollama-extractor.js";
import { OpenAiExtractionProvider } from "../llm/openai-extractor.js";
import {
    checkEmbeddingProviderReadiness,
    checkExtractionProviderReadiness,
    createEmbeddingProvider,
    createExtractionProvider,
    getEmbeddingProviderDefaults,
    getExtractionModel,
    listEmbeddingProviderIds,
    listExtractionProviderIds,
    resolveExtractionProviderId,
    unsupportedEmbeddingProviderMessage,
    unsupportedExtractionProviderMessage,
} from "./provider-registry.js";
import type { EmbeddingConfigData, MemoryConfig } from "../hooks/config-manager.js";

function embeddingConfig(overrides: Partial<EmbeddingConfigData> = {}): EmbeddingConfigData {
    return {
        enabled: true,
        provider: "local",
        model: "Xenova/all-MiniLM-L6-v2",
        dimensions: 384,
        batchSize: 100,
        ...overrides,
    };
}

function memoryConfig(embedding: EmbeddingConfigData): Pick<MemoryConfig, "embedding"> {
    return { embedding };
}

describe("provider-registry", () => {
    test("lists supported provider ids in registry order", () => {
        expect(listEmbeddingProviderIds()).toEqual(["local", "openai", "ollama", "openai-compatible"]);
        expect(listExtractionProviderIds()).toEqual(["anthropic", "openai", "ollama", "claude-cli", "openai-compatible"]);
    });

    test("returns embedding defaults from the registry", () => {
        expect(getEmbeddingProviderDefaults("openai-compatible")).toEqual({
            model: "text-embedding-3-small",
            dimensions: 1536,
        });
        expect(getEmbeddingProviderDefaults("unknown")).toBeUndefined();
    });

    test("formats unsupported provider messages from registry contents", () => {
        expect(unsupportedEmbeddingProviderMessage("unknown")).toBe(
            'Unsupported embedding provider: "unknown". Supported: local, openai, ollama, openai-compatible',
        );
        expect(unsupportedExtractionProviderMessage("unknown")).toBe(
            'Unsupported extraction provider: "unknown". Supported: anthropic, openai, ollama, claude-cli, openai-compatible',
        );
    });

    test("checks embedding readiness without resolving opaque secret references", () => {
        const result = checkEmbeddingProviderReadiness(embeddingConfig({
            provider: "openai-compatible",
            model: "text-embedding-3-small",
            dimensions: 1536,
            baseUrl: "https://gateway.example.test/v1",
            apiKeyRef: "authkey://memory/openai-compatible-key",
        }));

        expect(result.ready).toBe(false);
        expect(result.readyReason).toBe("API key reference configured but not available at runtime; run through a secret injector or set embedding.apiKeyEnv");
    });

    test("checks embedding readiness for supported, unsupported, and incomplete providers", () => {
        expect(checkEmbeddingProviderReadiness(embeddingConfig()).ready).toBe(true);
        expect(checkEmbeddingProviderReadiness(embeddingConfig({
            provider: "openai",
            model: "text-embedding-3-small",
            dimensions: 1536,
        })).readyReason).toBe("API key not available at runtime; set OPENAI_API_KEY or embedding.apiKeyEnv");
        expect(checkEmbeddingProviderReadiness(embeddingConfig({
            provider: "openai",
            model: "text-embedding-3-small",
            dimensions: 1536,
            apiKey: "openai-test-key",
        })).readyReason).toBe("Using deprecated plaintext config; prefer environment injection or embedding.apiKeyEnv");
        process.env.MEMORY_NEXUS_REGISTRY_OPENAI_KEY = "openai-test-key";
        try {
            expect(checkEmbeddingProviderReadiness(embeddingConfig({
                provider: "openai",
                model: "text-embedding-3-small",
                dimensions: 1536,
                apiKeyEnv: "MEMORY_NEXUS_REGISTRY_OPENAI_KEY",
            }))).toEqual({ ready: true, readyReason: undefined });
        } finally {
            delete process.env.MEMORY_NEXUS_REGISTRY_OPENAI_KEY;
        }
        expect(checkEmbeddingProviderReadiness(embeddingConfig({ provider: "ollama" })).readyReason).toBe(
            "Server reachability verified at sync time",
        );
        expect(checkEmbeddingProviderReadiness(embeddingConfig({ provider: "unknown" })).readyReason).toContain(
            "Unsupported embedding provider",
        );
        expect(checkEmbeddingProviderReadiness(embeddingConfig({
            provider: "openai-compatible",
            model: "text-embedding-3-small",
            dimensions: 1536,
        })).readyReason).toBe("openai-compatible embedding provider requires embedding.baseUrl");
    });

    test("creates local and openai-compatible embedding providers through the registry", () => {
        const localProvider = createEmbeddingProvider(embeddingConfig());
        expect(localProvider).toBeInstanceOf(TransformersJsProvider);

        const compatibleProvider = createEmbeddingProvider(embeddingConfig({
            provider: "openai-compatible",
            model: "text-embedding-3-small",
            dimensions: 1536,
            baseUrl: "https://gateway.example.test/v1",
            apiKey: "compat-test-key",
        }));
        expect(compatibleProvider).toBeInstanceOf(OpenAiProvider);
        expect(compatibleProvider.name).toBe("openai-compatible");
    });

    test("creates named embedding providers and rejects unsupported providers", () => {
        const openaiProvider = createEmbeddingProvider(embeddingConfig({
            provider: "openai",
            model: "text-embedding-3-small",
            dimensions: 1536,
            apiKey: "openai-test-key",
        }));
        const ollamaProvider = createEmbeddingProvider(embeddingConfig({
            provider: "ollama",
            model: "nomic-embed-text",
            dimensions: 768,
        }));

        expect(openaiProvider).toBeInstanceOf(OpenAiProvider);
        expect(ollamaProvider).toBeInstanceOf(OllamaProvider);
        expect(() => createEmbeddingProvider(embeddingConfig({ provider: "unknown" }))).toThrow(
            'Unsupported embedding provider: "unknown"',
        );
    });

    test("rejects provider creation when required runtime capabilities are absent", () => {
        expect(() => createEmbeddingProvider(embeddingConfig({
            provider: "openai",
            model: "text-embedding-3-small",
            dimensions: 1536,
        }))).toThrow("OpenAI embedding API key is required");

        expect(() => createEmbeddingProvider(embeddingConfig({
            provider: "openai-compatible",
            model: "text-embedding-3-small",
            dimensions: 1536,
            apiKey: "compat-test-key",
        }))).toThrow("openai-compatible embedding provider requires embedding.baseUrl");

        expect(() => createEmbeddingProvider(embeddingConfig({
            provider: "openai-compatible",
            model: "text-embedding-3-small",
            dimensions: 1536,
            baseUrl: "https://gateway.example.test/v1",
        }))).toThrow("openai-compatible embedding API key is required");
    });

    test("resolves extraction provider id explicitly and never falls back for unknown env values", () => {
        expect(resolveExtractionProviderId(memoryConfig(embeddingConfig()), {})).toBe("claude-cli");
        expect(resolveExtractionProviderId(memoryConfig(embeddingConfig({ provider: "openai" })), {})).toBe("openai");
        expect(resolveExtractionProviderId(memoryConfig(embeddingConfig()), { LLM_PROVIDER: "unknown" })).toBe("unknown");
    });

    test("uses extraction-specific model defaults and runtime model override", () => {
        const config = memoryConfig(embeddingConfig({
            provider: "openai",
            model: "text-embedding-3-small",
            dimensions: 1536,
        }));

        expect(getExtractionModel(config, "openai", {})).toBe("gpt-4o");
        expect(getExtractionModel(config, "openai", { LLM_MODEL: "gpt-4.1-mini" })).toBe("gpt-4.1-mini");
        expect(getExtractionModel(config, "unknown", {})).toBe("");
    });

    test("ignores blank extraction env overrides", () => {
        expect(resolveExtractionProviderId(memoryConfig(embeddingConfig({ provider: "openai" })), { LLM_PROVIDER: "   " })).toBe("openai");
        expect(getExtractionModel(memoryConfig(embeddingConfig()), "claude-cli", { LLM_MODEL: "   " })).toBe("claude-cli-print");
    });

    test("checks and creates openai-compatible extraction provider through baseUrl and injected key", () => {
        const config = memoryConfig(embeddingConfig({
            provider: "local",
            baseUrl: "https://gateway.example.test/v1",
            apiKey: "compat-test-key",
        }));

        const readiness = checkExtractionProviderReadiness(config, "openai-compatible");
        expect(readiness.ready).toBe(true);

        const oldProvider = process.env.LLM_PROVIDER;
        try {
            process.env.LLM_PROVIDER = "openai-compatible";
            const provider = createExtractionProvider(config);
            expect(provider).toBeInstanceOf(OpenAiExtractionProvider);
            expect(provider.providerId).toBe("openai-compatible");
            expect(provider.modelName).toBe("gpt-4o");
        } finally {
            if (oldProvider === undefined) {
                delete process.env.LLM_PROVIDER;
            } else {
                process.env.LLM_PROVIDER = oldProvider;
            }
        }
    });

    test("creates all first-party extraction providers through the registry", () => {
        const originalProvider = process.env.LLM_PROVIDER;
        try {
            process.env.LLM_PROVIDER = "anthropic";
            expect(createExtractionProvider(memoryConfig(embeddingConfig({ apiKey: "anthropic-key" })))).toBeInstanceOf(AnthropicExtractionProvider);

            process.env.LLM_PROVIDER = "openai";
            expect(createExtractionProvider(memoryConfig(embeddingConfig({ apiKey: "openai-key" })))).toBeInstanceOf(OpenAiExtractionProvider);

            process.env.LLM_PROVIDER = "ollama";
            expect(createExtractionProvider(memoryConfig(embeddingConfig({ baseUrl: "http://localhost:11434" })))).toBeInstanceOf(OllamaExtractionProvider);

            process.env.LLM_PROVIDER = "claude-cli";
            expect(createExtractionProvider(memoryConfig(embeddingConfig()))).toBeInstanceOf(ClaudeCliExtractionProvider);
        } finally {
            if (originalProvider === undefined) {
                delete process.env.LLM_PROVIDER;
            } else {
                process.env.LLM_PROVIDER = originalProvider;
            }
        }
    });

    test("reports unsupported and incomplete extraction providers", () => {
        const config = memoryConfig(embeddingConfig());
        const originalProvider = process.env.LLM_PROVIDER;

        expect(checkExtractionProviderReadiness(config, "unknown").readyReason).toContain("Unsupported extraction provider");
        expect(checkExtractionProviderReadiness(config, "anthropic").readyReason).toBe(
            "API key not available at runtime; set ANTHROPIC_API_KEY or embedding.apiKeyEnv",
        );
        expect(checkExtractionProviderReadiness(config, "openai").readyReason).toBe(
            "API key not available at runtime; set OPENAI_API_KEY or embedding.apiKeyEnv",
        );
        expect(checkExtractionProviderReadiness(memoryConfig(embeddingConfig({ apiKey: "plaintext-test-key" })), "openai").readyReason).toBe(
            "Using deprecated plaintext config; prefer environment injection or embedding.apiKeyEnv",
        );

        process.env.LLM_PROVIDER = "unknown";
        try {
            expect(() => createExtractionProvider(config)).toThrow('Unsupported extraction provider: "unknown"');
        } finally {
            if (originalProvider === undefined) {
                delete process.env.LLM_PROVIDER;
            } else {
                process.env.LLM_PROVIDER = originalProvider;
            }
        }

        expect(checkExtractionProviderReadiness(config, "openai-compatible").readyReason).toBe(
            "openai-compatible extraction provider requires embedding.baseUrl",
        );
    });

    test("rejects extraction provider creation when required runtime capabilities are absent", () => {
        const originalProvider = process.env.LLM_PROVIDER;
        try {
            process.env.LLM_PROVIDER = "anthropic";
            expect(() => createExtractionProvider(memoryConfig(embeddingConfig()))).toThrow("Anthropic extraction API key is required");

            process.env.LLM_PROVIDER = "openai";
            expect(() => createExtractionProvider(memoryConfig(embeddingConfig()))).toThrow("OpenAI extraction API key is required");

            process.env.LLM_PROVIDER = "openai-compatible";
            expect(() => createExtractionProvider(memoryConfig(embeddingConfig({ apiKey: "compat-test-key" })))).toThrow(
                "openai-compatible extraction provider requires embedding.baseUrl",
            );
            expect(() => createExtractionProvider(memoryConfig(embeddingConfig({
                baseUrl: "https://gateway.example.test/v1",
            })))).toThrow("openai-compatible extraction API key is required");
        } finally {
            if (originalProvider === undefined) {
                delete process.env.LLM_PROVIDER;
            } else {
                process.env.LLM_PROVIDER = originalProvider;
            }
        }
    });
});
