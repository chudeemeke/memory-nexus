import { describe, expect, it } from "bun:test";
import { Session } from "./session.js";
import { ProjectPath } from "../value-objects/project-path.js";
import { Message } from "./message.js";

describe("Session entity", () => {
  const projectPath = ProjectPath.fromDecoded("C:\\Users\\Destiny\\Projects\\foo");
  const startTime = new Date("2024-01-15T10:00:00Z");

  describe("construction", () => {
    it("creates with required properties", () => {
      const session = Session.create({
        id: "session-123",
        projectPath,
        startTime,
      });

      expect(session.id).toBe("session-123");
      expect(session.projectPath.equals(projectPath)).toBe(true);
      expect(session.startTime).toEqual(startTime);
      expect(session.endTime).toBeUndefined();
      expect(session.messages).toEqual([]);
    });

    it("creates with optional endTime", () => {
      const endTime = new Date("2024-01-15T12:00:00Z");
      const session = Session.create({
        id: "session-123",
        projectPath,
        startTime,
        endTime,
      });

      expect(session.endTime).toEqual(endTime);
    });

    it("creates with initial messages", () => {
      const message = Message.create({
        id: "msg-1",
        role: "user",
        content: "Hello",
        timestamp: startTime,
      });

      const session = Session.create({
        id: "session-123",
        projectPath,
        startTime,
        messages: [message],
      });

      expect(session.messages).toHaveLength(1);
      expect(session.messages[0].id).toBe("msg-1");
    });

    it("throws on empty id", () => {
      expect(() =>
        Session.create({
          id: "",
          projectPath,
          startTime,
        })
      ).toThrow("Session ID cannot be empty");
    });

    it("throws if endTime is before startTime", () => {
      const endTime = new Date("2024-01-14T10:00:00Z");
      expect(() =>
        Session.create({
          id: "session-123",
          projectPath,
          startTime,
          endTime,
        })
      ).toThrow("End time cannot be before start time");
    });
  });

  describe("identity", () => {
    it("equality is based on id", () => {
      const session1 = Session.create({
        id: "session-123",
        projectPath,
        startTime,
      });
      const session2 = Session.create({
        id: "session-123",
        projectPath: ProjectPath.fromDecoded("C:\\Different\\Path"),
        startTime: new Date("2024-02-01T10:00:00Z"),
      });

      expect(session1.equals(session2)).toBe(true);
    });

    it("different ids are not equal", () => {
      const session1 = Session.create({
        id: "session-123",
        projectPath,
        startTime,
      });
      const session2 = Session.create({
        id: "session-456",
        projectPath,
        startTime,
      });

      expect(session1.equals(session2)).toBe(false);
    });
  });

  describe("message management", () => {
    it("addMessage appends to messages", () => {
      const session = Session.create({
        id: "session-123",
        projectPath,
        startTime,
      });

      const message = Message.create({
        id: "msg-1",
        role: "user",
        content: "Hello",
        timestamp: startTime,
      });

      const updated = session.addMessage(message);

      expect(updated.messages).toHaveLength(1);
      expect(updated.messages[0].id).toBe("msg-1");
    });

    it("addMessage returns new instance (immutability)", () => {
      const session = Session.create({
        id: "session-123",
        projectPath,
        startTime,
      });

      const message = Message.create({
        id: "msg-1",
        role: "user",
        content: "Hello",
        timestamp: startTime,
      });

      const updated = session.addMessage(message);

      expect(session.messages).toHaveLength(0);
      expect(updated.messages).toHaveLength(1);
      expect(session).not.toBe(updated);
    });

    it("messages array is a copy (immutable)", () => {
      const message = Message.create({
        id: "msg-1",
        role: "user",
        content: "Hello",
        timestamp: startTime,
      });

      const session = Session.create({
        id: "session-123",
        projectPath,
        startTime,
        messages: [message],
      });

      const messages = session.messages;
      messages.push(
        Message.create({
          id: "msg-2",
          role: "assistant",
          content: "Hi",
          timestamp: startTime,
        })
      );

      expect(session.messages).toHaveLength(1);
    });
  });

  describe("duration", () => {
    it("calculates duration when session is complete", () => {
      const endTime = new Date("2024-01-15T12:30:00Z");
      const session = Session.create({
        id: "session-123",
        projectPath,
        startTime,
        endTime,
      });

      expect(session.durationMs).toBe(2.5 * 60 * 60 * 1000); // 2.5 hours
    });

    it("returns undefined duration when session is ongoing", () => {
      const session = Session.create({
        id: "session-123",
        projectPath,
        startTime,
      });

      expect(session.durationMs).toBeUndefined();
    });
  });

  describe("complete", () => {
    it("sets endTime", () => {
      const session = Session.create({
        id: "session-123",
        projectPath,
        startTime,
      });

      const endTime = new Date("2024-01-15T12:00:00Z");
      const completed = session.complete(endTime);

      expect(completed.endTime).toEqual(endTime);
    });

    it("returns new instance (immutability)", () => {
      const session = Session.create({
        id: "session-123",
        projectPath,
        startTime,
      });

      const endTime = new Date("2024-01-15T12:00:00Z");
      const completed = session.complete(endTime);

      expect(session.endTime).toBeUndefined();
      expect(session).not.toBe(completed);
    });

    it("throws if endTime is before startTime", () => {
      const session = Session.create({
        id: "session-123",
        projectPath,
        startTime,
      });

      const endTime = new Date("2024-01-14T10:00:00Z");
      expect(() => session.complete(endTime)).toThrow(
        "End time cannot be before start time"
      );
    });
  });
});
