import type {
  EmbeddingConfigData,
  MemoryConfig,
  ProviderEgressPolicyData,
} from "../hooks/config-manager.js";
import { DEFAULT_PROVIDER_EGRESS_POLICY } from "../hooks/config-manager.js";

export const DEFAULT_ALLOWED_REMOTE_HOSTS = [...DEFAULT_PROVIDER_EGRESS_POLICY.allowedHosts];
export const DEFAULT_ALLOWED_REMOTE_PROVIDERS = [...DEFAULT_PROVIDER_EGRESS_POLICY.allowedProviders];

export interface ProviderEgressAssessment {
  required: boolean;
  allowed: boolean;
  target: string;
  capability: "embedding" | "extraction";
  provider: string;
  host?: string | undefined;
  reason?: string | undefined;
  warnings: string[];
}

interface EgressTarget {
  required: boolean;
  target: string;
  host?: string | undefined;
}

type ConfigWithProviderEgress = Pick<MemoryConfig, "embedding"> & {
  providerEgress?: ProviderEgressPolicyData | undefined;
};

export { DEFAULT_PROVIDER_EGRESS_POLICY };

export function assessEmbeddingProviderEgress(
  embedding: EmbeddingConfigData,
  policy: ProviderEgressPolicyData = DEFAULT_PROVIDER_EGRESS_POLICY,
): ProviderEgressAssessment {
  const target = embeddingEgressTarget(embedding);
  return assessTarget({
    capability: "embedding",
    provider: embedding.provider,
    policy,
    target,
  });
}

export function assessExtractionProviderEgress(
  config: ConfigWithProviderEgress,
  providerId: string,
): ProviderEgressAssessment {
  const policy = config.providerEgress ?? DEFAULT_PROVIDER_EGRESS_POLICY;
  const target = extractionEgressTarget(providerId, config.embedding);
  return assessTarget({
    capability: "extraction",
    provider: providerId,
    policy,
    target,
  });
}

export function requireProviderEgressAllowed(assessment: ProviderEgressAssessment): void {
  if (!assessment.allowed) {
    throw new Error(assessment.reason ?? "Provider egress is not allowed by policy");
  }
}

function assessTarget(input: {
  capability: "embedding" | "extraction";
  provider: string;
  policy: ProviderEgressPolicyData;
  target: EgressTarget;
}): ProviderEgressAssessment {
  const { capability, provider, policy, target } = input;

  if (!target.required) {
    return {
      required: false,
      allowed: true,
      capability,
      provider,
      target: target.target,
      host: target.host,
      warnings: [],
    };
  }

  if (policy.consent !== "granted") {
    return {
      required: true,
      allowed: false,
      capability,
      provider,
      target: target.target,
      host: target.host,
      reason: `Remote ${capability} provider egress consent is not granted. Set providerEgress.consent to "granted" after reviewing what redacted memory content may leave this machine.`,
      warnings: [],
    };
  }

  if (target.host) {
    const allowedHosts = new Set(policy.allowedHosts.map((host) => host.toLowerCase()));
    if (!allowedHosts.has(target.host.toLowerCase())) {
      return {
        required: true,
        allowed: false,
        capability,
        provider,
        target: target.target,
        host: target.host,
        reason: `Remote ${capability} provider host ${target.host} is not in providerEgress.allowedHosts.`,
        warnings: [],
      };
    }
  } else {
    const allowedProviders = new Set(policy.allowedProviders.map((allowedProvider) => allowedProvider.toLowerCase()));
    if (!allowedProviders.has(provider.toLowerCase())) {
      return {
        required: true,
        allowed: false,
        capability,
        provider,
        target: target.target,
        reason: `Remote ${capability} provider ${provider} is not in providerEgress.allowedProviders.`,
        warnings: [],
      };
    }
  }

  return {
    required: true,
    allowed: true,
    capability,
    provider,
    target: target.target,
    host: target.host,
    warnings: [
      target.host
        ? `Remote ${capability} provider egress is enabled for host ${target.host}.`
        : `Remote ${capability} provider egress is enabled for provider ${provider}.`,
    ],
  };
}

function embeddingEgressTarget(embedding: EmbeddingConfigData): EgressTarget {
  switch (embedding.provider) {
    case "local":
      return { required: false, target: "local" };
    case "ollama":
      return targetFromUrl(embedding.baseUrl ?? "http://localhost:11434", "ollama");
    case "openai":
      return targetFromUrl(embedding.baseUrl ?? "https://api.openai.com/v1", "openai");
    case "openai-compatible":
      return targetFromUrl(embedding.baseUrl, "openai-compatible");
    default:
      return { required: true, target: embedding.provider };
  }
}

function extractionEgressTarget(providerId: string, embedding: EmbeddingConfigData): EgressTarget {
  switch (providerId) {
    case "ollama":
      return targetFromUrl(embedding.baseUrl ?? "http://localhost:11434", "ollama");
    case "anthropic":
      return targetFromUrl("https://api.anthropic.com", "anthropic");
    case "openai":
      return targetFromUrl(embedding.baseUrl ?? "https://api.openai.com/v1", "openai");
    case "openai-compatible":
      return targetFromUrl(embedding.baseUrl, "openai-compatible");
    case "claude-cli":
      return { required: true, target: "claude-cli" };
    default:
      return { required: true, target: providerId };
  }
}

function targetFromUrl(url: string | undefined, fallbackTarget: string): EgressTarget {
  if (!url) {
    return { required: true, target: fallbackTarget };
  }

  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    return {
      required: !isLocalHost(host),
      target: host,
      host: !isLocalHost(host) ? host : undefined,
    };
  } catch {
    return { required: true, target: fallbackTarget };
  }
}

function isLocalHost(host: string): boolean {
  const normalized = host.toLowerCase();
  return normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized.endsWith(".localhost");
}
