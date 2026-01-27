import { describe, expect, it } from "bun:test";
import { Message, MessageRole } from "./message.js";

describe("Message entity", () => {
  const timestamp = new Date("2024-01-15T10:30:00Z");

  describe("construction", () => {
    it("creates user message", () => {
      const message = Message.create({
        id: "msg-123",
        role: "user",
        content: "Hello, Claude",
        timestamp,
      });

      expect(message.id).toBe("msg-123");
      expect(message.role).toBe("user");
      expect(message.content).toBe("Hello, Claude");
      expect(message.timestamp).toEqual(timestamp);
      expect(message.toolUses).toEqual([]);
    });

    it("creates assistant message", () => {
      const message = Message.create({
        id: "msg-456",
        role: "assistant",
        content: "Hello! How can I help?",
        timestamp,
      });

      expect(message.role).toBe("assistant");
    });

    it("throws on empty id", () => {
      expect(() =>
        Message.create({
          id: "",
          role: "user",
          content: "Hello",
          timestamp,
        })
      ).toThrow("Message ID cannot be empty");
    });

    it("throws on invalid role", () => {
      expect(() =>
        Message.create({
          id: "msg-123",
          role: "invalid" as MessageRole,
          content: "Hello",
          timestamp,
        })
      ).toThrow("Invalid message role");
    });

    it("allows empty content", () => {
      const message = Message.create({
        id: "msg-123",
        role: "assistant",
        content: "",
        timestamp,
      });

      expect(message.content).toBe("");
    });
  });

  describe("identity", () => {
    it("equality is based on id", () => {
      const message1 = Message.create({
        id: "msg-123",
        role: "user",
        content: "Hello",
        timestamp,
      });
      const message2 = Message.create({
        id: "msg-123",
        role: "assistant",
        content: "Different content",
        timestamp: new Date("2024-02-01T10:00:00Z"),
      });

      expect(message1.equals(message2)).toBe(true);
    });

    it("different ids are not equal", () => {
      const message1 = Message.create({
        id: "msg-123",
        role: "user",
        content: "Hello",
        timestamp,
      });
      const message2 = Message.create({
        id: "msg-456",
        role: "user",
        content: "Hello",
        timestamp,
      });

      expect(message1.equals(message2)).toBe(false);
    });
  });

  describe("immutability", () => {
    it("timestamp is a copy", () => {
      const originalDate = new Date("2024-01-15T10:30:00Z");
      const message = Message.create({
        id: "msg-123",
        role: "user",
        content: "Hello",
        timestamp: originalDate,
      });

      originalDate.setFullYear(2020);
      expect(message.timestamp.getFullYear()).toBe(2024);
    });

    it("returned timestamp is a copy", () => {
      const message = Message.create({
        id: "msg-123",
        role: "user",
        content: "Hello",
        timestamp,
      });

      const ts = message.timestamp;
      ts.setFullYear(2020);
      expect(message.timestamp.getFullYear()).toBe(2024);
    });
  });

  describe("tool uses", () => {
    it("creates with initial toolUseIds", () => {
      const message = Message.create({
        id: "msg-123",
        role: "assistant",
        content: "Let me read that file...",
        timestamp,
        toolUseIds: ["tool-1", "tool-2"],
      });

      expect(message.toolUses).toEqual(["tool-1", "tool-2"]);
    });

    it("toolUses array is a copy (immutable)", () => {
      const message = Message.create({
        id: "msg-123",
        role: "assistant",
        content: "Let me read that file...",
        timestamp,
        toolUseIds: ["tool-1"],
      });

      const toolUses = message.toolUses;
      toolUses.push("tool-2");

      expect(message.toolUses).toEqual(["tool-1"]);
    });

    it("addToolUse returns new message with tool added", () => {
      const message = Message.create({
        id: "msg-123",
        role: "assistant",
        content: "Reading file...",
        timestamp,
      });

      const updated = message.addToolUse("tool-1");

      expect(message.toolUses).toEqual([]);
      expect(updated.toolUses).toEqual(["tool-1"]);
      expect(message).not.toBe(updated);
    });

    it("addToolUse appends to existing tools", () => {
      const message = Message.create({
        id: "msg-123",
        role: "assistant",
        content: "Reading files...",
        timestamp,
        toolUseIds: ["tool-1"],
      });

      const updated = message.addToolUse("tool-2");

      expect(updated.toolUses).toEqual(["tool-1", "tool-2"]);
    });
  });

  describe("content helpers", () => {
    it("hasContent returns true when content is non-empty", () => {
      const message = Message.create({
        id: "msg-123",
        role: "user",
        content: "Hello",
        timestamp,
      });

      expect(message.hasContent).toBe(true);
    });

    it("hasContent returns false when content is empty", () => {
      const message = Message.create({
        id: "msg-123",
        role: "assistant",
        content: "",
        timestamp,
      });

      expect(message.hasContent).toBe(false);
    });

    it("hasToolUses returns true when toolUses is non-empty", () => {
      const message = Message.create({
        id: "msg-123",
        role: "assistant",
        content: "",
        timestamp,
        toolUseIds: ["tool-1"],
      });

      expect(message.hasToolUses).toBe(true);
    });

    it("hasToolUses returns false when toolUses is empty", () => {
      const message = Message.create({
        id: "msg-123",
        role: "user",
        content: "Hello",
        timestamp,
      });

      expect(message.hasToolUses).toBe(false);
    });
  });
});
