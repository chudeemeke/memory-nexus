import { describe, expect, test } from "bun:test";
import { PatternRedactor } from "./pattern-redactor.js";

describe("PatternRedactor", () => {
  test("redacts API keys without returning raw values in findings", () => {
    const redactor = new PatternRedactor();
    const secret = ["sk", "proj_abcdefghijklmnopqrstuvwxyz1234567890"].join("-");
    const raw = `Use OPENAI_API_KEY=${secret} now`;

    const result = redactor.redactText(raw);

    expect(result.text).toMatch(/OPENAI_API_KEY=\[REDACTED:env_secret:[a-f0-9]{8}\]/);
    expect(result.text).not.toContain(secret);
    expect(JSON.stringify(result.findings)).not.toContain("sk-proj");
    expect(result.findings[0]?.hash).toMatch(/^[a-f0-9]{8}$/);
    expect(result.findings[0]?.ruleVersion).toBe("pattern-redactor-v2");
  });

  test("redacts nested JSON strings while preserving object shape", () => {
    const redactor = new PatternRedactor();

    const result = redactor.redactJson({
      command: "deploy",
      headers: {
        authorization: ["Bearer", "abcdefghijklmnopqrstuvwxyz123456"].join(" "),
      },
      args: ["--token", ["ghp", "abcdefghijklmnopqrstuvwxyz1234567890"].join("_")],
    });

    expect(result.value).toEqual({
      command: "deploy",
      headers: {
        authorization: expect.stringMatching(/^Bearer \[REDACTED:bearer_token:[a-f0-9]{8}\]$/),
      },
      args: ["--token", expect.stringMatching(/^\[REDACTED:api_key:[a-f0-9]{8}\]$/)],
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

    expect(result.text).toMatch(/^key:\n\[REDACTED:private_key:[a-f0-9]{8}\]$/);
    expect(result.findings[0]?.kind).toBe("private_key");
  });

  test("redacts circular JSON references without recursing forever", () => {
    const redactor = new PatternRedactor();
    const input: Record<string, unknown> = {
      name: "cycle",
    };
    input.self = input;

    const result = redactor.redactJson(input);

    expect(result.value).toEqual({
      name: "cycle",
      self: "[REDACTED:circular]",
    });
  });

  test("redacts sensitive JSON keys even when values do not match provider-specific token patterns", () => {
    const redactor = new PatternRedactor();

    const result = redactor.redactJson({
      provider: "custom",
      apiKey: "short-runtime-key",
      nested: {
        password: "correct horse battery staple",
        publicName: "safe",
      },
    });

    expect(result.value).toEqual({
      provider: "custom",
      apiKey: expect.stringMatching(/^\[REDACTED:api_key:[a-f0-9]{8}\]$/),
      nested: {
        password: expect.stringMatching(/^\[REDACTED:env_secret:[a-f0-9]{8}\]$/),
        publicName: "safe",
      },
    });
    expect(JSON.stringify(result.findings)).not.toContain("short-runtime-key");
    expect(JSON.stringify(result.findings)).not.toContain("correct horse");
  });

  test("redacts Tailscale keys and flag-adjacent array values", () => {
    const redactor = new PatternRedactor();
    const tailscaleKey = ["tskey", "auth", "abcdefghijklmnopqrstuvwxyz1234567890"].join("-");

    const result = redactor.redactJson({
      command: "tailscale up",
      raw: tailscaleKey,
      args: ["--authkey", "not-provider-shaped-but-sensitive"],
    });

    expect(result.value).toEqual({
      command: "tailscale up",
      raw: expect.stringMatching(/^\[REDACTED:api_key:[a-f0-9]{8}\]$/),
      args: ["--authkey", expect.stringMatching(/^\[REDACTED:env_secret:[a-f0-9]{8}\]$/)],
    });
    expect(JSON.stringify(result.value)).not.toContain(tailscaleKey);
    expect(JSON.stringify(result.findings)).not.toContain(tailscaleKey);
  });
});
