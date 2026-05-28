import { describe, expect, test } from "bun:test";
import { PatternRedactor } from "./pattern-redactor.js";

describe("PatternRedactor", () => {
  test("redacts API keys without returning raw values in findings", () => {
    const redactor = new PatternRedactor();
    const secret = ["sk", "proj_abcdefghijklmnopqrstuvwxyz1234567890"].join("-");
    const raw = `Use OPENAI_API_KEY=${secret} now`;

    const result = redactor.redactText(raw);

    expect(result.text).toContain("OPENAI_API_KEY=[REDACTED:env_secret]");
    expect(result.text).not.toContain(secret);
    expect(JSON.stringify(result.findings)).not.toContain("sk-proj");
  });

  test("redacts nested JSON strings while preserving object shape", () => {
    const redactor = new PatternRedactor();

    const result = redactor.redactJson({
      command: "deploy",
      headers: {
        authorization: "Bearer abcdefghijklmnopqrstuvwxyz123456",
      },
      args: ["--token", ["ghp", "abcdefghijklmnopqrstuvwxyz1234567890"].join("_")],
    });

    expect(result.value).toEqual({
      command: "deploy",
      headers: {
        authorization: "Bearer [REDACTED:bearer_token]",
      },
      args: ["--token", "[REDACTED:api_key]"],
    });
    expect(result.findings.length).toBe(2);
  });

  test("redacts private keys across multiple lines", () => {
    const redactor = new PatternRedactor();
    const pem = [
      "-----BEGIN PRIVATE KEY-----",
      "abc123",
      "-----END PRIVATE KEY-----",
    ].join("\n");

    const result = redactor.redactText(`key:\n${pem}`);

    expect(result.text).toBe("key:\n[REDACTED:private_key]");
    expect(result.findings[0]?.kind).toBe("private_key");
  });
});
