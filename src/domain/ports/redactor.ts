export type RedactionKind =
  | "api_key"
  | "aws_access_key"
  | "bearer_token"
  | "env_secret"
  | "jwt"
  | "private_key";

export interface RedactionFinding {
  kind: RedactionKind;
  placeholder: string;
  hash?: string | undefined;
  ruleVersion?: string | undefined;
  path?: string | undefined;
}

export interface RedactionResult {
  text: string;
  findings: RedactionFinding[];
}

export interface JsonRedactionResult<T> {
  value: T;
  findings: RedactionFinding[];
}

export interface IRedactor {
  redactText(input: string): RedactionResult;
  redactJson<T>(input: T): JsonRedactionResult<T>;
}
