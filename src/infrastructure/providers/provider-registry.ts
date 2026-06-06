/**
 * Provider Registry
 *
 * Internal registry for runtime provider capabilities. This is deliberately
 * not an external plugin loader: provider support is explicit, testable, and
 * wired through typed factories.
 */

import type { IEmbeddingProvider } from "../../domain/ports/embedding.js";
import type { IExtractionProvider } from "../../domain/ports/extraction.js";
import type { EmbeddingConfigData, MemoryConfig, ProviderEgressPolicyData } from "../hooks/config-manager.js";
import { resolveEmbeddingApiKey } from "../hooks/config-manager.js";
import { TransformersJsProvider } from "../embedding/transformers-js-provider.js";
import { OpenAiProvider } from "../embedding/openai-provider.js";
import { OllamaProvider } from "../embedding/ollama-provider.js";
import { AnthropicExtractionProvider } from "../llm/anthropic-extractor.js";
import { ClaudeCliExtractionProvider } from "../llm/claude-cli-extractor.js";
import { OllamaExtractionProvider } from "../llm/ollama-extractor.js";
import { OpenAiExtractionProvider } from "../llm/openai-extractor.js";
import {
    EMBEDDING_PROVIDER_DEFAULTS,
    EXTRACTION_PROVIDER_DEFAULT_MODELS,
} from "./provider-defaults.js";
import {
    assessEmbeddingProviderEgress,
    assessExtractionProviderEgress,
    DEFAULT_PROVIDER_EGRESS_POLICY,
    requireProviderEgressAllowed,
} from "./provider-egress-policy.js";

export interface ProviderReadiness {
    ready: boolean;
    readyReason?: string | undefined;
}

interface EmbeddingProviderRegistration {
    id: string;
    defaultModel: string;
    defaultDimensions: number;
    checkReadiness(config: EmbeddingConfigData): ProviderReadiness;
    create(config: EmbeddingConfigData): IEmbeddingProvider;
}

interface ExtractionProviderRegistration {
    id: string;
    defaultModel: string;
    checkReadiness(config: EmbeddingConfigData): ProviderReadiness;
    create(config: EmbeddingConfigData, model: string): IExtractionProvider;
}

function ready(readyReason?: string): ProviderReadiness {
    return { ready: true, readyReason };
}

function notReady(readyReason: string): ProviderReadiness {
    return { ready: false, readyReason };
}

function keyReadiness(
    config: EmbeddingConfigData,
    providerEnvVars: string[],
    missingEnvHelp: string,
): ProviderReadiness {
    const resolution = resolveEmbeddingApiKey(config, providerEnvVars);
    if (resolution.source === "missing") {
        return notReady(
            resolution.ref
                ? "API key reference configured but not available at runtime; run through a secret injector or set embedding.apiKeyEnv"
                : missingEnvHelp,
        );
    }

    if (resolution.deprecatedPlaintext) {
        return ready("Using deprecated plaintext config; prefer environment injection or embedding.apiKeyEnv");
    }

    return ready();
}

function requireApiKey(
    config: EmbeddingConfigData,
    providerEnvVars: string[],
    providerName: string,
): string {
    const resolution = resolveEmbeddingApiKey(config, providerEnvVars);
    if (!resolution.apiKey) {
        throw new Error(
            `${providerName} API key is required. Set ${providerEnvVars.join(" or ")} or configure embedding.apiKeyEnv for runtime injection. apiKeyRef is an opaque reference and is not resolved by memory-nexus.`,
        );
    }
    return resolution.apiKey;
}

function requireBaseUrl(config: EmbeddingConfigData, capability: "embedding" | "extraction"): string {
    if (!config.baseUrl) {
        throw new Error(`openai-compatible ${capability} provider requires embedding.baseUrl`);
    }
    return config.baseUrl;
}

const EMBEDDING_PROVIDERS: EmbeddingProviderRegistration[] = [
    {
        id: "local",
        defaultModel: EMBEDDING_PROVIDER_DEFAULTS.local!.model,
        defaultDimensions: EMBEDDING_PROVIDER_DEFAULTS.local!.dimensions,
        checkReadiness: () => ready(),
        create: (config) => new TransformersJsProvider({
            model: config.model,
            dimensions: config.dimensions,
        }),
    },
    {
        id: "openai",
        defaultModel: EMBEDDING_PROVIDER_DEFAULTS.openai!.model,
        defaultDimensions: EMBEDDING_PROVIDER_DEFAULTS.openai!.dimensions,
        checkReadiness: (config) => keyReadiness(
            config,
            ["OPENAI_API_KEY"],
            "API key not available at runtime; set OPENAI_API_KEY or embedding.apiKeyEnv",
        ),
        create: (config) => new OpenAiProvider({
            apiKey: requireApiKey(config, ["OPENAI_API_KEY"], "OpenAI embedding"),
            model: config.model,
            dimensions: config.dimensions,
            baseUrl: config.baseUrl,
        }),
    },
    {
        id: "ollama",
        defaultModel: EMBEDDING_PROVIDER_DEFAULTS.ollama!.model,
        defaultDimensions: EMBEDDING_PROVIDER_DEFAULTS.ollama!.dimensions,
        checkReadiness: () => ready("Server reachability verified at sync time"),
        create: (config) => new OllamaProvider({
            model: config.model,
            dimensions: config.dimensions,
            baseUrl: config.baseUrl,
        }),
    },
    {
        id: "openai-compatible",
        defaultModel: EMBEDDING_PROVIDER_DEFAULTS["openai-compatible"]!.model,
        defaultDimensions: EMBEDDING_PROVIDER_DEFAULTS["openai-compatible"]!.dimensions,
        checkReadiness: (config) => {
            if (!config.baseUrl) {
                return notReady("openai-compatible embedding provider requires embedding.baseUrl");
            }
            return keyReadiness(
                config,
                [],
                "API key not available at runtime; set embedding.apiKeyEnv for openai-compatible",
            );
        },
        create: (config) => new OpenAiProvider({
            apiKey: requireApiKey(config, [], "openai-compatible embedding"),
            model: config.model,
            dimensions: config.dimensions,
            baseUrl: requireBaseUrl(config, "embedding"),
            providerId: "openai-compatible",
        }),
    },
];

const EXTRACTION_PROVIDERS: ExtractionProviderRegistration[] = [
    {
        id: "anthropic",
        defaultModel: EXTRACTION_PROVIDER_DEFAULT_MODELS.anthropic!,
        checkReadiness: (config) => keyReadiness(
            config,
            ["ANTHROPIC_API_KEY"],
            "API key not available at runtime; set ANTHROPIC_API_KEY or embedding.apiKeyEnv",
        ),
        create: (config, model) => new AnthropicExtractionProvider({
            apiKey: requireApiKey(config, ["ANTHROPIC_API_KEY"], "Anthropic extraction"),
            model,
        }),
    },
    {
        id: "openai",
        defaultModel: EXTRACTION_PROVIDER_DEFAULT_MODELS.openai!,
        checkReadiness: (config) => keyReadiness(
            config,
            ["OPENAI_API_KEY"],
            "API key not available at runtime; set OPENAI_API_KEY or embedding.apiKeyEnv",
        ),
        create: (config, model) => new OpenAiExtractionProvider({
            apiKey: requireApiKey(config, ["OPENAI_API_KEY"], "OpenAI extraction"),
            model,
        }),
    },
    {
        id: "ollama",
        defaultModel: EXTRACTION_PROVIDER_DEFAULT_MODELS.ollama!,
        checkReadiness: () => ready(),
        create: (config, model) => new OllamaExtractionProvider({
            baseUrl: config.baseUrl,
            model,
        }),
    },
    {
        id: "claude-cli",
        defaultModel: EXTRACTION_PROVIDER_DEFAULT_MODELS["claude-cli"]!,
        checkReadiness: () => ready(),
        create: () => new ClaudeCliExtractionProvider(),
    },
    {
        id: "openai-compatible",
        defaultModel: EXTRACTION_PROVIDER_DEFAULT_MODELS["openai-compatible"]!,
        checkReadiness: (config) => {
            if (!config.baseUrl) {
                return notReady("openai-compatible extraction provider requires embedding.baseUrl");
            }
            return keyReadiness(
                config,
                [],
                "API key not available at runtime; set embedding.apiKeyEnv for openai-compatible",
            );
        },
        create: (config, model) => new OpenAiExtractionProvider({
            apiKey: requireApiKey(config, [], "openai-compatible extraction"),
            model,
            baseUrl: requireBaseUrl(config, "extraction"),
            providerId: "openai-compatible",
        }),
    },
];

const embeddingProviderMap = new Map(EMBEDDING_PROVIDERS.map((provider) => [provider.id, provider]));
const extractionProviderMap = new Map(EXTRACTION_PROVIDERS.map((provider) => [provider.id, provider]));

export function listEmbeddingProviderIds(): string[] {
    return EMBEDDING_PROVIDERS.map((provider) => provider.id);
}

export function listExtractionProviderIds(): string[] {
    return EXTRACTION_PROVIDERS.map((provider) => provider.id);
}

export function unsupportedEmbeddingProviderMessage(providerId: string): string {
    return `Unsupported embedding provider: "${providerId}". Supported: ${listEmbeddingProviderIds().join(", ")}`;
}

export function unsupportedExtractionProviderMessage(providerId: string): string {
    return `Unsupported extraction provider: "${providerId}". Supported: ${listExtractionProviderIds().join(", ")}`;
}

export function getEmbeddingProviderDefaults(providerId: string): { model: string; dimensions: number } | undefined {
    const provider = embeddingProviderMap.get(providerId);
    if (!provider) return undefined;
    return {
        model: provider.defaultModel,
        dimensions: provider.defaultDimensions,
    };
}

export function checkEmbeddingProviderReadiness(
    config: EmbeddingConfigData,
    providerEgress: ProviderEgressPolicyData = DEFAULT_PROVIDER_EGRESS_POLICY,
): ProviderReadiness {
    const provider = embeddingProviderMap.get(config.provider);
    if (!provider) {
        return notReady(unsupportedEmbeddingProviderMessage(config.provider));
    }
    const providerReadiness = provider.checkReadiness(config);
    if (!providerReadiness.ready) {
        return providerReadiness;
    }

    const egress = assessEmbeddingProviderEgress(config, providerEgress);
    if (!egress.allowed) {
        return notReady(egress.reason ?? "Provider egress is not allowed by policy");
    }

    return providerReadiness;
}

export function createEmbeddingProvider(
    config: EmbeddingConfigData,
    providerEgress: ProviderEgressPolicyData = DEFAULT_PROVIDER_EGRESS_POLICY,
): IEmbeddingProvider {
    const provider = embeddingProviderMap.get(config.provider);
    if (!provider) {
        throw new Error(unsupportedEmbeddingProviderMessage(config.provider));
    }
    const readiness = provider.checkReadiness(config);
    if (readiness.ready) {
        requireProviderEgressAllowed(assessEmbeddingProviderEgress(config, providerEgress));
    }
    return provider.create(config);
}

export function resolveExtractionProviderId(config: Pick<MemoryConfig, "embedding">, env: NodeJS.ProcessEnv = process.env): string {
    const envProvider = env.LLM_PROVIDER?.trim();
    if (envProvider) return envProvider;

    const configuredProvider = config.embedding?.provider ?? "claude-cli";
    return configuredProvider === "local" ? "claude-cli" : configuredProvider;
}

export function getExtractionModel(
    _config: Pick<MemoryConfig, "embedding">,
    providerId: string,
    env: NodeJS.ProcessEnv = process.env,
): string {
    const provider = extractionProviderMap.get(providerId);
    if (!provider) return "";

    const envModel = env.LLM_MODEL?.trim();
    return envModel || provider.defaultModel;
}

export function checkExtractionProviderReadiness(
    config: Pick<MemoryConfig, "embedding">,
    providerId = resolveExtractionProviderId(config),
): ProviderReadiness {
    const provider = extractionProviderMap.get(providerId);
    if (!provider) {
        return notReady(unsupportedExtractionProviderMessage(providerId));
    }
    const providerReadiness = provider.checkReadiness(config.embedding);
    if (!providerReadiness.ready) {
        return providerReadiness;
    }

    const egress = assessExtractionProviderEgress(config as Pick<MemoryConfig, "embedding"> & { providerEgress?: ProviderEgressPolicyData }, providerId);
    if (!egress.allowed) {
        return notReady(egress.reason ?? "Provider egress is not allowed by policy");
    }

    return providerReadiness;
}

export function createExtractionProvider(config: Pick<MemoryConfig, "embedding"> & { providerEgress?: ProviderEgressPolicyData }): IExtractionProvider {
    const providerId = resolveExtractionProviderId(config);
    const provider = extractionProviderMap.get(providerId);
    if (!provider) {
        throw new Error(unsupportedExtractionProviderMessage(providerId));
    }
    const readiness = provider.checkReadiness(config.embedding);
    if (readiness.ready) {
        requireProviderEgressAllowed(assessExtractionProviderEgress(config, providerId));
    }
    return provider.create(config.embedding, getExtractionModel(config, providerId));
}
