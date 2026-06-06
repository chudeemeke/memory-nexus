import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { DEFAULT_CONFIG, type MemoryConfig } from "../hooks/config-manager.js";
import {
  checkCapabilityInterop,
  maskCapabilityReference,
  type CapabilityCommandResolver,
} from "./capability-status.js";

function memoryConfig(overrides: Partial<MemoryConfig> = {}): MemoryConfig {
  return {
    ...DEFAULT_CONFIG,
    machineId: "test-machine",
    ...overrides,
    embedding: {
      ...DEFAULT_CONFIG.embedding,
      ...(overrides.embedding ?? {}),
    },
    providerEgress: {
      ...DEFAULT_CONFIG.providerEgress,
      ...(overrides.providerEgress ?? {}),
    },
  };
}

function recordingResolver(path: string | null, calls: string[]): CapabilityCommandResolver {
  return (command) => {
    calls.push(command);
    return path;
  };
}

describe("capability-status", () => {
  test("reports authkey absence as optional provider unavailable, not a failure", () => {
    const calls: string[] = [];
    const result = checkCapabilityInterop(memoryConfig(), {
      commandResolver: recordingResolver(null, calls),
      env: { PATH: "" },
    });

    expect(result.providers).toHaveLength(1);
    expect(result.providers[0]?.provider).toBe("authkey");
    expect(result.providers[0]?.available).toBe(false);
    expect(result.providers[0]?.status).toBe("optional_unavailable");
    expect(result.references).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(calls).toEqual(["authkey"]);
  });

  test("masks authkey references and never invokes raw secret retrieval commands", () => {
    const secretLikeHandle = ["sk", "ant", "123456789012345678901234567890"].join("-");
    const rawReference = `authkey://memory/${secretLikeHandle}`;
    const calls: string[] = [];

    const result = checkCapabilityInterop(
      memoryConfig({
        embedding: {
          ...DEFAULT_CONFIG.embedding,
          provider: "openai",
          model: "text-embedding-3-small",
          dimensions: 1536,
          apiKeyRef: rawReference,
        },
      }),
      {
        commandResolver: recordingResolver(null, calls),
        env: { PATH: "" },
      },
    );

    const serialized = JSON.stringify(result);
    expect(result.references[0]?.provider).toBe("authkey");
    expect(result.references[0]?.scheme).toBe("authkey");
    expect(result.references[0]?.status).toBe("reference_only");
    expect(result.references[0]?.maskedReference).toMatch(/^authkey:\/\/\[redacted:[a-f0-9]{12}\]$/);
    expect(serialized).not.toContain(secretLikeHandle);
    expect(serialized).not.toContain(rawReference);
    expect(calls).toEqual(["authkey"]);
    expect(calls.join(" ")).not.toContain("get");
  });

  test("reports environment injection readiness without returning the injected value", () => {
    const injectedSecret = ["sk", "proj", "123456789012345678901234567890"].join("-");
    const result = checkCapabilityInterop(
      memoryConfig({
        embedding: {
          ...DEFAULT_CONFIG.embedding,
          provider: "openai",
          model: "text-embedding-3-small",
          dimensions: 1536,
          apiKeyRef: "authkey://memory/openai-api-key",
        },
      }),
      {
        commandResolver: () => "C:\\Tools\\authkey.exe",
        env: {
          PATH: "",
          OPENAI_API_KEY: injectedSecret,
        },
      },
    );

    expect(result.providers[0]?.available).toBe(true);
    expect(result.providers[0]?.status).toBe("available");
    expect(result.references[0]?.runtimeSecretSource).toBe("environment");
    expect(result.references[0]?.envVar).toBe("OPENAI_API_KEY");
    expect(result.references[0]?.status).toBe("env_available");
    expect(JSON.stringify(result)).not.toContain(injectedSecret);
    expect(JSON.stringify(result)).not.toContain("authkey.exe");
  });

  test("uses configured apiKeyEnv for runtime capability readiness", () => {
    const injectedSecret = ["sk", "envname", "123456789012345678901234567890"].join("-");
    const result = checkCapabilityInterop(
      memoryConfig({
        embedding: {
          ...DEFAULT_CONFIG.embedding,
          provider: "openai-compatible",
          baseUrl: "https://gateway.example.test/v1",
          apiKeyEnv: "MEMORY_PROVIDER_KEY",
          apiKeyRef: "vault://team/openai-compatible-key",
        },
      }),
      {
        commandResolver: () => null,
        env: {
          PATH: "",
          MEMORY_PROVIDER_KEY: injectedSecret,
        },
      },
    );

    expect(result.references[0]?.runtimeSecretSource).toBe("environment");
    expect(result.references[0]?.envVar).toBe("MEMORY_PROVIDER_KEY");
    expect(JSON.stringify(result)).not.toContain(injectedSecret);
  });

  test("uses extraction provider default env vars without reading or returning values", () => {
    const injectedSecret = ["sk", "anthropic", "123456789012345678901234567890"].join("-");
    const result = checkCapabilityInterop(
      memoryConfig({
        embedding: {
          ...DEFAULT_CONFIG.embedding,
          provider: "anthropic",
          apiKeyRef: "authkey://memory/anthropic-api-key",
        },
      }),
      {
        commandResolver: () => null,
        env: {
          PATH: "",
          ANTHROPIC_API_KEY: injectedSecret,
        },
      },
    );

    expect(result.references[0]?.runtimeSecretSource).toBe("environment");
    expect(result.references[0]?.envVar).toBe("ANTHROPIC_API_KEY");
    expect(JSON.stringify(result)).not.toContain(injectedSecret);
  });

  test("redacts deprecated plaintext config from capability diagnostics", () => {
    const plaintextSecret = ["sk", "test", "123456789012345678901234567890"].join("-");
    const result = checkCapabilityInterop(
      memoryConfig({
        embedding: {
          ...DEFAULT_CONFIG.embedding,
          provider: "openai",
          model: "text-embedding-3-small",
          dimensions: 1536,
          apiKey: plaintextSecret,
          apiKeyRef: "authkey://memory/openai-api-key",
        },
      }),
      {
        commandResolver: () => null,
        env: { PATH: "" },
      },
    );

    expect(result.references[0]?.runtimeSecretSource).toBe("plaintext-config");
    expect(result.references[0]?.status).toBe("plaintext_config_deprecated");
    expect(JSON.stringify(result)).not.toContain(plaintextSecret);
  });

  test("parses future capability schemes without adding hard dependencies", () => {
    const result = checkCapabilityInterop(
      memoryConfig({
        embedding: {
          ...DEFAULT_CONFIG.embedding,
          provider: "openai-compatible",
          baseUrl: "https://gateway.example.test/v1",
          apiKeyRef: "vault://team/openai-compatible-key",
        },
      }),
      {
        commandResolver: () => null,
        env: { PATH: "" },
      },
    );

    expect(result.providers.map((provider) => provider.provider)).toEqual(["authkey", "vault"]);
    expect(result.references[0]?.provider).toBe("vault");
    expect(result.references[0]?.status).toBe("reference_only");
    expect(result.providers[1]?.status).toBe("reference_only");
  });

  test("masks malformed references with a stable fingerprint", () => {
    const rawReference = "not a url but might contain sk-test-secret";

    const masked = maskCapabilityReference(rawReference);

    expect(masked.scheme).toBe("unknown");
    expect(masked.provider).toBe("unknown");
    expect(masked.maskedReference).toMatch(/^\[redacted-ref:[a-f0-9]{12}\]$/);
    expect(JSON.stringify(masked)).not.toContain("sk-test-secret");
  });

  test("detects optional command availability by PATH without exposing the resolved path", () => {
    const dir = mkdtempSync(join(tmpdir(), "memory-capability-path-"));
    try {
      const commandPath = join(dir, "authkey.EXE");
      writeFileSync(commandPath, "");
      chmodSync(commandPath, 0o755);

      const result = checkCapabilityInterop(memoryConfig(), {
        env: {
          PATH: dir,
          PATHEXT: ".EXE",
        },
        platform: "win32",
      });

      expect(result.providers[0]?.available).toBe(true);
      expect(result.providers[0]?.status).toBe("available");
      expect(JSON.stringify(result)).not.toContain(dir);
      expect(JSON.stringify(result)).not.toContain(commandPath);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("default command resolver handles missing PATH as optional unavailable", () => {
    const result = checkCapabilityInterop(memoryConfig(), {
      env: {},
    });

    expect(result.providers[0]?.available).toBe(false);
    expect(result.providers[0]?.status).toBe("optional_unavailable");
  });

  test("default command resolver treats non-empty PATH without command as optional unavailable", () => {
    const dir = mkdtempSync(join(tmpdir(), "memory-capability-missing-command-"));
    try {
      const result = checkCapabilityInterop(memoryConfig(), {
        env: {
          PATH: dir,
        },
        platform: "linux",
      });

      expect(result.providers[0]?.available).toBe(false);
      expect(result.providers[0]?.status).toBe("optional_unavailable");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("default command resolver supports non-Windows PATH lookup and empty path segments", () => {
    const dir = mkdtempSync(join(tmpdir(), "memory-capability-linux-path-"));
    try {
      const commandPath = join(dir, "authkey");
      writeFileSync(commandPath, "");
      chmodSync(commandPath, 0o755);

      const result = checkCapabilityInterop(memoryConfig(), {
        env: {
          PATH: `${delimiter}${dir}`,
        },
        platform: "linux",
      });

      expect(result.providers[0]?.available).toBe(true);
      expect(result.providers[0]?.status).toBe("available");
      expect(JSON.stringify(result)).not.toContain(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("default command resolver falls back to standard Windows extensions", () => {
    const dir = mkdtempSync(join(tmpdir(), "memory-capability-default-ext-"));
    try {
      writeFileSync(join(dir, "authkey.EXE"), "");

      const result = checkCapabilityInterop(memoryConfig(), {
        env: {
          PATH: dir,
          PATHEXT: "",
        },
        platform: "win32",
      });

      expect(result.providers[0]?.available).toBe(true);
      expect(result.providers[0]?.status).toBe("available");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
