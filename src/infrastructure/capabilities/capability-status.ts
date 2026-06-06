import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import type {
  CapabilityInteropStatus,
  CapabilityProviderStatus,
  CapabilityReferenceStatusReport,
  CapabilitySecretSource,
  CapabilitySignal,
  MaskedCapabilityReference,
} from "../../domain/ports/capability.js";
import type { MemoryConfig } from "../hooks/config-manager.js";
import {
  getEmbeddingProviderSecretEnvVars,
  getExtractionProviderSecretEnvVars,
  resolveExtractionProviderId,
} from "../providers/provider-registry.js";

export type CapabilityCommandResolver = (command: string) => string | null;

export interface CapabilityStatusOptions {
  env?: NodeJS.ProcessEnv | undefined;
  platform?: NodeJS.Platform | undefined;
  commandResolver?: CapabilityCommandResolver | undefined;
}

interface OptionalCapabilityProviderDefinition {
  provider: string;
  schemes: string[];
  command: string;
  optional: true;
  allowedSignals: CapabilitySignal[];
}

interface RuntimeSecretResolution {
  source: CapabilitySecretSource;
  envVar?: string | undefined;
}

const OPTIONAL_PROVIDER_DEFINITIONS: OptionalCapabilityProviderDefinition[] = [
  {
    provider: "authkey",
    schemes: ["authkey"],
    command: "authkey",
    optional: true,
    allowedSignals: ["env-injection", "masked-metadata", "proofs", "fingerprints"],
  },
];

export function checkCapabilityInterop(
  config: MemoryConfig,
  options: CapabilityStatusOptions = {},
): CapabilityInteropStatus {
  const env = options.env ?? process.env;
  const resolver = options.commandResolver ?? ((command) => resolveCommandOnPath(command, env, options.platform));
  const references = collectCapabilityReferences(config, env);
  const providerStatuses = new Map<string, CapabilityProviderStatus>();

  for (const definition of OPTIONAL_PROVIDER_DEFINITIONS) {
    const executablePath = resolver(definition.command);
    providerStatuses.set(definition.provider, {
      provider: definition.provider,
      optional: definition.optional,
      available: Boolean(executablePath),
      status: executablePath ? "available" : "optional_unavailable",
      statusSource: "path",
      allowedSignals: definition.allowedSignals,
      rawSecretAccess: "forbidden",
      warnings: [],
    });
  }

  for (const reference of references) {
    if (!providerStatuses.has(reference.provider)) {
      providerStatuses.set(reference.provider, {
        provider: reference.provider,
        optional: true,
        available: false,
        status: "reference_only",
        statusSource: "reference",
        allowedSignals: ["masked-metadata"],
        rawSecretAccess: "forbidden",
        warnings: [],
      });
    }
  }

  return {
    providers: Array.from(providerStatuses.values()),
    references,
    warnings: references
      .filter((reference) => reference.status === "plaintext_config_deprecated")
      .map((reference) => `Deprecated plaintext secret configuration is present for ${reference.source}; migrate to runtime environment injection.`),
  };
}

export function maskCapabilityReference(rawReference: string): MaskedCapabilityReference {
  const fingerprint = createHash("sha256").update(rawReference).digest("hex").slice(0, 12);
  const parsed = parseCapabilityReference(rawReference);

  if (!parsed) {
    return {
      scheme: "unknown",
      provider: "unknown",
      maskedReference: `[redacted-ref:${fingerprint}]`,
      fingerprint,
    };
  }

  return {
    scheme: parsed.scheme,
    provider: parsed.provider,
    maskedReference: `${parsed.scheme}://[redacted:${fingerprint}]`,
    fingerprint,
  };
}

function collectCapabilityReferences(
  config: MemoryConfig,
  env: NodeJS.ProcessEnv,
): CapabilityReferenceStatusReport[] {
  const apiKeyRef = config.embedding.apiKeyRef;
  if (!apiKeyRef) {
    return [];
  }

  const masked = maskCapabilityReference(apiKeyRef);
  const resolution = resolveRuntimeSecretSource(config, env);
  const status = referenceStatusFromSecretSource(resolution.source);

  return [
    {
      source: "embedding.apiKeyRef",
      provider: masked.provider,
      scheme: masked.scheme,
      maskedReference: masked.maskedReference,
      fingerprint: masked.fingerprint,
      runtimeSecretSource: resolution.source,
      envVar: resolution.envVar,
      status,
      note: noteForReferenceStatus(status),
    },
  ];
}

function parseCapabilityReference(rawReference: string): { scheme: string; provider: string } | null {
  const match = /^([A-Za-z][A-Za-z0-9+.-]*):\/\//.exec(rawReference);
  if (!match?.[1]) {
    return null;
  }

  const scheme = match[1].toLowerCase();
  const provider = providerForScheme(scheme);
  return { scheme, provider };
}

function providerForScheme(scheme: string): string {
  const definition = OPTIONAL_PROVIDER_DEFINITIONS.find((item) => item.schemes.includes(scheme));
  return definition?.provider ?? scheme;
}

function resolveRuntimeSecretSource(config: MemoryConfig, env: NodeJS.ProcessEnv): RuntimeSecretResolution {
  const candidates = runtimeSecretEnvVars(config, env);

  for (const envVar of candidates) {
    if (env[envVar]) {
      return {
        source: "environment",
        envVar,
      };
    }
  }

  if (config.embedding.apiKey) {
    return { source: "plaintext-config" };
  }

  return { source: "missing" };
}

function runtimeSecretEnvVars(config: MemoryConfig, env: NodeJS.ProcessEnv): string[] {
  const vars = new Set<string>();
  if (config.embedding.apiKeyEnv) {
    vars.add(config.embedding.apiKeyEnv);
  }

  for (const envVar of getEmbeddingProviderSecretEnvVars(config.embedding.provider)) {
    vars.add(envVar);
  }

  const extractionProvider = resolveExtractionProviderId(config, env);
  for (const envVar of getExtractionProviderSecretEnvVars(extractionProvider)) {
    vars.add(envVar);
  }

  return Array.from(vars);
}

function referenceStatusFromSecretSource(source: CapabilitySecretSource): CapabilityReferenceStatusReport["status"] {
  switch (source) {
    case "environment":
      return "env_available";
    case "plaintext-config":
      return "plaintext_config_deprecated";
    case "missing":
      return "reference_only";
  }
}

function noteForReferenceStatus(status: CapabilityReferenceStatusReport["status"]): string {
  switch (status) {
    case "env_available":
      return "Runtime environment contains the referenced provider secret; the value was not returned.";
    case "plaintext_config_deprecated":
      return "Deprecated plaintext config is present; migrate to environment injection or embedding.apiKeyEnv.";
    case "reference_only":
      return "Run through a secret injector or set embedding.apiKeyEnv.";
  }
}

function resolveCommandOnPath(
  command: string,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
): string | null {
  const pathValue = env.PATH ?? "";
  if (!pathValue) {
    return null;
  }

  const extensions = platform === "win32"
    ? commandExtensions(env.PATHEXT)
    : [""];

  for (const dir of pathValue.split(delimiter)) {
    if (!dir) {
      continue;
    }
    for (const extension of extensions) {
      const candidate = join(dir, `${command}${extension}`);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

function commandExtensions(pathExt: string | undefined): string[] {
  const configured = pathExt?.split(";").filter((item) => item.trim() !== "");
  return configured && configured.length > 0
    ? configured
    : [".EXE", ".CMD", ".BAT", ".COM"];
}
