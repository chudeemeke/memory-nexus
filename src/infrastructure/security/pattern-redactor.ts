import type {
  IRedactor,
  JsonRedactionResult,
  RedactionFinding,
  RedactionKind,
  RedactionResult,
} from "../../domain/ports/redactor.js";

interface SecretPattern {
  kind: RedactionKind;
  pattern: RegExp;
  preservePrefix?: (match: string) => string;
}

const SECRET_PATTERNS: SecretPattern[] = [
  {
    kind: "private_key",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
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
  },
  {
    kind: "env_secret",
    pattern: /\b([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS|CREDENTIAL)[A-Z0-9_]*)\s*=\s*(?:"[^"]+"|'[^']+'|[^\s]+)/g,
    preservePrefix: (match) => `${match.split("=")[0]!.trim()}=`,
  },
];

export class PatternRedactor implements IRedactor {
  redactText(input: string): RedactionResult {
    let text = input;
    const findings: RedactionFinding[] = [];

    for (const secretPattern of SECRET_PATTERNS) {
      text = text.replace(secretPattern.pattern, (match) => {
        const placeholder = `[REDACTED:${secretPattern.kind}]`;
        findings.push({ kind: secretPattern.kind, placeholder });
        return `${secretPattern.preservePrefix?.(match) ?? ""}${placeholder}`;
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
      return input.map((item) => this.redactUnknown(item, findings, seen));
    }

    if (input && typeof input === "object") {
      if (seen.has(input)) {
        return "[REDACTED:circular]";
      }
      seen.add(input);

      const output: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(input)) {
        output[key] = this.redactUnknown(value, findings, seen);
      }
      return output;
    }

    return input;
  }
}
