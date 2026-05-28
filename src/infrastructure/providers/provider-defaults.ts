/**
 * Provider defaults shared by configuration loading and provider registry.
 *
 * This file intentionally contains only data. It lets config-manager apply
 * provider-specific embedding defaults without importing provider factories.
 */

export const EMBEDDING_PROVIDER_DEFAULTS: Record<string, { model: string; dimensions: number }> = {
    local: { model: "Xenova/all-MiniLM-L6-v2", dimensions: 384 },
    openai: { model: "text-embedding-3-small", dimensions: 1536 },
    ollama: { model: "nomic-embed-text", dimensions: 768 },
    "openai-compatible": { model: "text-embedding-3-small", dimensions: 1536 },
};

export const EXTRACTION_PROVIDER_DEFAULT_MODELS: Record<string, string> = {
    anthropic: "claude-3-5-sonnet-20241022",
    openai: "gpt-4o",
    ollama: "llama3",
    "claude-cli": "claude-cli-print",
    "openai-compatible": "gpt-4o",
};
