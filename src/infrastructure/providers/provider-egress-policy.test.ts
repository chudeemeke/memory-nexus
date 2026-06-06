import { describe, expect, test } from "bun:test";
import type { EmbeddingConfigData, ProviderEgressPolicyData } from "../hooks/config-manager.js";
import {
  assessEmbeddingProviderEgress,
  assessExtractionProviderEgress,
  DEFAULT_ALLOWED_REMOTE_HOSTS,
  DEFAULT_ALLOWED_REMOTE_PROVIDERS,
  DEFAULT_PROVIDER_EGRESS_POLICY,
  requireProviderEgressAllowed,
} from "./provider-egress-policy.js";

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

function grantedPolicy(overrides: Partial<ProviderEgressPolicyData> = {}): ProviderEgressPolicyData {
  return {
    ...DEFAULT_PROVIDER_EGRESS_POLICY,
    consent: "granted",
    ...overrides,
  };
}

describe("provider egress policy", () => {
  test("does not require egress consent for local embedding providers", () => {
    const assessment = assessEmbeddingProviderEgress(embeddingConfig(), DEFAULT_PROVIDER_EGRESS_POLICY);

    expect(assessment.required).toBe(false);
    expect(assessment.allowed).toBe(true);
    expect(assessment.target).toBe("local");
  });

  test("blocks remote embedding providers until consent is granted", () => {
    const assessment = assessEmbeddingProviderEgress(embeddingConfig({
      provider: "openai",
      model: "text-embedding-3-small",
      dimensions: 1536,
    }), DEFAULT_PROVIDER_EGRESS_POLICY);

    expect(assessment.required).toBe(true);
    expect(assessment.allowed).toBe(false);
    expect(assessment.host).toBe("api.openai.com");
    expect(assessment.reason).toContain("provider egress consent is not granted");
  });

  test("blocks openai-compatible hosts that are not allowlisted", () => {
    const assessment = assessEmbeddingProviderEgress(embeddingConfig({
      provider: "openai-compatible",
      model: "text-embedding-3-small",
      dimensions: 1536,
      baseUrl: "https://gateway.example.test/v1",
    }), grantedPolicy());

    expect(assessment.allowed).toBe(false);
    expect(assessment.reason).toContain("gateway.example.test is not in providerEgress.allowedHosts");
  });

  test("allows remote provider only when consent and allowlist both pass", () => {
    const assessment = assessEmbeddingProviderEgress(embeddingConfig({
      provider: "openai-compatible",
      model: "text-embedding-3-small",
      dimensions: 1536,
      baseUrl: "https://gateway.example.test/v1",
    }), grantedPolicy({
      allowedHosts: [...DEFAULT_ALLOWED_REMOTE_HOSTS, "gateway.example.test"],
    }));

    expect(assessment.allowed).toBe(true);
    expect(assessment.warnings).toEqual([
      "Remote embedding provider egress is enabled for host gateway.example.test.",
    ]);
  });

  test("treats remote Ollama base URLs as provider egress", () => {
    expect(assessEmbeddingProviderEgress(embeddingConfig({
      provider: "ollama",
      baseUrl: "http://localhost:11434",
    }), DEFAULT_PROVIDER_EGRESS_POLICY).required).toBe(false);

    const remoteAssessment = assessEmbeddingProviderEgress(embeddingConfig({
      provider: "ollama",
      baseUrl: "http://192.0.2.10:11434",
    }), DEFAULT_PROVIDER_EGRESS_POLICY);

    expect(remoteAssessment.required).toBe(true);
    expect(remoteAssessment.allowed).toBe(false);
  });

  test("uses provider allowlist for hostless extraction providers such as claude-cli", () => {
    const blocked = assessExtractionProviderEgress(
      { embedding: embeddingConfig(), providerEgress: DEFAULT_PROVIDER_EGRESS_POLICY },
      "claude-cli",
    );
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain("provider egress consent is not granted");

    const allowed = assessExtractionProviderEgress(
      {
        embedding: embeddingConfig(),
        providerEgress: grantedPolicy({
          allowedProviders: DEFAULT_ALLOWED_REMOTE_PROVIDERS,
        }),
      },
      "claude-cli",
    );
    expect(allowed.allowed).toBe(true);
    expect(allowed.target).toBe("claude-cli");
  });

  test("uses safe defaults when no provider egress policy is configured", () => {
    const assessment = assessExtractionProviderEgress(
      { embedding: embeddingConfig() },
      "anthropic",
    );

    expect(assessment.required).toBe(true);
    expect(assessment.allowed).toBe(false);
    expect(assessment.host).toBe("api.anthropic.com");
    expect(assessment.reason).toContain("provider egress consent is not granted");
  });

  test("blocks hostless provider targets that are not provider-allowlisted", () => {
    const compatibleWithoutUrl = assessEmbeddingProviderEgress(embeddingConfig({
      provider: "openai-compatible",
      model: "custom-embedding",
      dimensions: 768,
      baseUrl: undefined,
    }), grantedPolicy());

    expect(compatibleWithoutUrl.allowed).toBe(false);
    expect(compatibleWithoutUrl.target).toBe("openai-compatible");
    expect(compatibleWithoutUrl.reason).toContain("openai-compatible is not in providerEgress.allowedProviders");

    const unknownExtraction = assessExtractionProviderEgress(
      {
        embedding: embeddingConfig(),
        providerEgress: grantedPolicy(),
      },
      "custom-extractor",
    );

    expect(unknownExtraction.allowed).toBe(false);
    expect(unknownExtraction.target).toBe("custom-extractor");
    expect(unknownExtraction.reason).toContain("custom-extractor is not in providerEgress.allowedProviders");
  });

  test("supports explicitly allowlisted custom hostless providers", () => {
    const assessment = assessEmbeddingProviderEgress(embeddingConfig({
      provider: "custom-vector" as EmbeddingConfigData["provider"],
      model: "custom-embedding",
      dimensions: 768,
    }), grantedPolicy({
      allowedProviders: [...DEFAULT_ALLOWED_REMOTE_PROVIDERS, "custom-vector"],
    }));

    expect(assessment.allowed).toBe(true);
    expect(assessment.host).toBeUndefined();
    expect(assessment.warnings).toEqual([
      "Remote embedding provider egress is enabled for provider custom-vector.",
    ]);
  });

  test("requireProviderEgressAllowed throws policy-specific messages", () => {
    expect(() => requireProviderEgressAllowed(
      assessEmbeddingProviderEgress(embeddingConfig({
        provider: "openai",
        model: "text-embedding-3-small",
        dimensions: 1536,
      }), DEFAULT_PROVIDER_EGRESS_POLICY),
    )).toThrow("provider egress consent is not granted");
  });

  test("requireProviderEgressAllowed uses a deterministic fallback message", () => {
    expect(() => requireProviderEgressAllowed({
      required: true,
      allowed: false,
      capability: "embedding",
      provider: "custom-vector",
      target: "custom-vector",
      warnings: [],
    })).toThrow("Provider egress is not allowed by policy");
  });
});
