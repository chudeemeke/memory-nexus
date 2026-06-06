export type CapabilitySignal = "env-injection" | "masked-metadata" | "proofs" | "fingerprints";

export type CapabilityProviderStatusValue =
  | "available"
  | "optional_unavailable"
  | "reference_only";

export type CapabilityReferenceStatus =
  | "env_available"
  | "reference_only"
  | "plaintext_config_deprecated";

export type CapabilitySecretSource =
  | "environment"
  | "plaintext-config"
  | "missing";

export interface MaskedCapabilityReference {
  scheme: string;
  provider: string;
  maskedReference: string;
  fingerprint: string;
}

export interface CapabilityProviderStatus {
  provider: string;
  optional: boolean;
  available: boolean;
  status: CapabilityProviderStatusValue;
  statusSource: "path" | "reference";
  allowedSignals: CapabilitySignal[];
  rawSecretAccess: "forbidden";
  warnings: string[];
}

export interface CapabilityReferenceStatusReport extends MaskedCapabilityReference {
  source: "embedding.apiKeyRef";
  runtimeSecretSource: CapabilitySecretSource;
  status: CapabilityReferenceStatus;
  envVar?: string | undefined;
  note: string;
}

export interface CapabilityInteropStatus {
  providers: CapabilityProviderStatus[];
  references: CapabilityReferenceStatusReport[];
  warnings: string[];
}

export interface ICapabilityStatusProvider {
  getStatus(): CapabilityInteropStatus;
}
