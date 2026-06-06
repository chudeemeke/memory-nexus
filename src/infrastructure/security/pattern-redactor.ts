import type {
  IRedactor,
  JsonRedactionResult,
  RedactionFinding,
  RedactionKind,
  RedactionResult,
} from "../../domain/ports/redactor.js";
import { createHash } from "node:crypto";

interface SecretPattern {
  kind: RedactionKind;
  pattern: RegExp;
  preservePrefix?: (match: string) => string;
  secretValue?: (match: string) => string;
}

export const PATTERN_REDACTOR_RULE_VERSION = "pattern-redactor-v2";

const SECRET_PATTERNS: SecretPattern[] = [
  {
    kind: "private_key",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  },
  {
    kind: "env_secret",
    pattern: /\b([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS|CREDENTIAL)[A-Z0-9_]*)\s*=\s*(?:"[^"]+"|'[^']+'|[^\s]+)/g,
    preservePrefix: (match) => `${match.split("=")[0]!.trim()}=`,
    secretValue: (match) => match.slice(match.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, ""),
  },
  {
    kind: "api_key",
    pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    kind: "api_key",
    pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    kind: "api_key",
    pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
  },
  {
    kind: "api_key",
    pattern: /\btskey-(?:auth|client)-[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    kind: "aws_access_key",
    pattern: /\b(A3T[A-Z0-9]|AKIA|ASIA)[A-Z0-9]{16}\b/g,
  },
  {
    kind: "jwt",
    pattern: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
  },
  {
    kind: "bearer_token",
    pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/g,
    preservePrefix: () => "Bearer ",
    secretValue: (match) => match.replace(/^Bearer\s+/i, ""),
  },
];

const SENSITIVE_KEY_PATTERN = /(?:api[-_]?key|auth[-_]?key|authorization|bearer|token|secret|password|passwd|pwd|credential)/i;
const SENSITIVE_FLAG_PATTERN = /^--?(?:api[-_]?key|auth[-_]?key|token|secret|password|passwd|pwd|credential)$/i;
const REDACTED_PLACEHOLDER_PATTERN = /^\[REDACTED:[a-z_]+(?::[a-f0-9]{8})?\]$/;

export class PatternRedactor implements IRedactor {
  redactText(input: string): RedactionResult {
    let text = input;
    const findings: RedactionFinding[] = [];

    for (const secretPattern of SECRET_PATTERNS) {
      text = text.replace(secretPattern.pattern, (match) => {
        const secretValue = secretPattern.secretValue?.(match) ?? match;
        const finding = createFinding(secretPattern.kind, secretValue);
        findings.push(finding);
        return `${secretPattern.preservePrefix?.(match) ?? ""}${finding.placeholder}`;
      });
    }

    return { text, findings };
  }

  redactJson<T>(input: T): JsonRedactionResult<T> {
    const findings: RedactionFinding[] = [];
    const value = this.redactUnknown(input, findings, new WeakSet<object>()) as T;
    return { value, findings };
  }

  private redactUnknown(
    input: unknown,
    findings: RedactionFinding[],
    seen: WeakSet<object>,
  ): unknown {
    if (typeof input === "string") {
      const result = this.redactText(input);
      findings.push(...result.findings);
      return result.text;
    }

    if (Array.isArray(input)) {
      return input.map((item, index) => {
        const previous = input[index - 1];
        if (typeof item === "string" && typeof previous === "string" && SENSITIVE_FLAG_PATTERN.test(previous)) {
          return this.redactFlagAdjacentValue(item, findings);
        }
        return this.redactUnknown(item, findings, seen);
      });
    }

    if (input && typeof input === "object") {
      if (seen.has(input)) {
        return "[REDACTED:circular]";
      }
      seen.add(input);

      const output: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(input)) {
        output[key] = this.redactObjectValue(key, value, findings, seen);
      }
      return output;
    }

    return input;
  }

  private redactObjectValue(
    key: string,
    value: unknown,
    findings: RedactionFinding[],
    seen: WeakSet<object>,
  ): unknown {
    if (typeof value !== "string") {
      return this.redactUnknown(value, findings, seen);
    }

    const patternResult = this.redactText(value);
    if (patternResult.findings.length > 0) {
      findings.push(...patternResult.findings);
      return patternResult.text;
    }

    if (SENSITIVE_KEY_PATTERN.test(key) && value.trim() !== "" && !REDACTED_PLACEHOLDER_PATTERN.test(value)) {
      const finding = createFinding(redactionKindForKey(key), value);
      findings.push(finding);
      return finding.placeholder;
    }

    return value;
  }

  private redactFlagAdjacentValue(value: string, findings: RedactionFinding[]): string {
    if (value.trim() === "" || REDACTED_PLACEHOLDER_PATTERN.test(value)) {
      return value;
    }

    const patternResult = this.redactText(value);
    if (patternResult.findings.length > 0) {
      findings.push(...patternResult.findings);
      return patternResult.text;
    }

    const finding = createFinding("env_secret", value);
    findings.push(finding);
    return finding.placeholder;
  }
}

function createFinding(kind: RedactionKind, rawValue: string): RedactionFinding {
  const hash = createHash("sha256").update(rawValue).digest("hex").slice(0, 8);
  return {
    kind,
    hash,
    ruleVersion: PATTERN_REDACTOR_RULE_VERSION,
    placeholder: `[REDACTED:${kind}:${hash}]`,
  };
}

function redactionKindForKey(key: string): RedactionKind {
  if (/api[-_]?key|auth[-_]?key/i.test(key)) {
    return "api_key";
  }
  if (/authorization|bearer|token/i.test(key)) {
    return "bearer_token";
  }
  return "env_secret";
}
