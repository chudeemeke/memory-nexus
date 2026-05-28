import { describe, expect, it, spyOn } from "bun:test";

import { Message } from "../../domain/entities/message.js";
import { buildExtractionPrompt, parseLlmResponse } from "./extraction-helper.js";

describe("buildExtractionPrompt", () => {
  it("includes timestamped messages and extraction schema guidance", () => {
    const prompt = buildExtractionPrompt([
      Message.create({
        id: "m1",
        role: "user",
        content: "Use env-injected secrets",
        timestamp: new Date("2026-05-28T10:00:00.000Z"),
      }),
      Message.create({
        id: "m2",
        role: "assistant",
        content: "Decision captured",
        timestamp: new Date("2026-05-28T10:01:00.000Z"),
      }),
    ]);

    expect(prompt).toContain("[2026-05-28T10:00:00.000Z] USER: Use env-injected secrets");
    expect(prompt).toContain("[2026-05-28T10:01:00.000Z] ASSISTANT: Decision captured");
    expect(prompt).toContain('"decision" | "learning" | "preference" | "friction" | "observation"');
  });
});

describe("parseLlmResponse", () => {
  it("parses a JSON array embedded in surrounding prose", () => {
    const facts = parseLlmResponse(`
      Here is the extraction:
      [
        {"type":"decision","content":"Use Bun","confidence":0.9,"metadata":{"tool":"bun"}}
      ]
    `);

    expect(facts).toEqual([
      {
        type: "decision",
        content: "Use Bun",
        confidence: 0.9,
        metadata: { tool: "bun" },
      },
    ]);
  });

  it("returns an empty list for non-array JSON and invalid JSON", () => {
    const errorSpy = spyOn(console, "error").mockImplementation(() => undefined);

    expect(parseLlmResponse('{"content":"not an array"}')).toEqual([]);
    expect(parseLlmResponse("not json")).toEqual([]);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it("skips invalid content and defaults unknown fact types to observation", () => {
    const facts = parseLlmResponse(JSON.stringify([
      { type: "learning", content: "  " },
      { type: "not-a-kind", content: "Observed fallback", confidence: 0.5 },
      { type: "friction", content: 123 },
    ]));

    expect(facts).toEqual([
      {
        type: "observation",
        content: "Observed fallback",
        confidence: 0.5,
        metadata: undefined,
      },
    ]);
  });

  it("clamps confidence and ignores non-object metadata", () => {
    const facts = parseLlmResponse(JSON.stringify([
      { type: "preference", content: "High", confidence: 2, metadata: "nope" },
      { type: "friction", content: "Low", confidence: -1, metadata: null },
      { type: "observation", content: "Default confidence" },
    ]));

    expect(facts.map((fact) => fact.confidence)).toEqual([1, 0, 0.8]);
    expect(facts.map((fact) => fact.metadata)).toEqual([undefined, undefined, undefined]);
  });
});

