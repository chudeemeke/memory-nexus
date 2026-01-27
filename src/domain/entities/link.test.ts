import { describe, expect, it } from "bun:test";
import { Link, LinkType, EntityType } from "./link.js";

describe("Link entity", () => {
  describe("construction", () => {
    it("creates with required properties", () => {
      const link = Link.create({
        sourceType: "session",
        sourceId: "session-123",
        targetType: "session",
        targetId: "session-456",
        relationship: "related_to",
      });

      expect(link.sourceType).toBe("session");
      expect(link.sourceId).toBe("session-123");
      expect(link.targetType).toBe("session");
      expect(link.targetId).toBe("session-456");
      expect(link.relationship).toBe("related_to");
      expect(link.weight).toBe(1.0);
    });

    it("creates with custom weight", () => {
      const link = Link.create({
        sourceType: "message",
        sourceId: "msg-1",
        targetType: "topic",
        targetId: "topic-auth",
        relationship: "mentions",
        weight: 0.75,
      });

      expect(link.weight).toBe(0.75);
    });

    it("throws on empty sourceId", () => {
      expect(() =>
        Link.create({
          sourceType: "session",
          sourceId: "",
          targetType: "session",
          targetId: "session-456",
          relationship: "related_to",
        })
      ).toThrow("Source ID cannot be empty");
    });

    it("throws on empty targetId", () => {
      expect(() =>
        Link.create({
          sourceType: "session",
          sourceId: "session-123",
          targetType: "session",
          targetId: "",
          relationship: "related_to",
        })
      ).toThrow("Target ID cannot be empty");
    });

    it("throws on invalid sourceType", () => {
      expect(() =>
        Link.create({
          sourceType: "invalid" as EntityType,
          sourceId: "id-1",
          targetType: "session",
          targetId: "id-2",
          relationship: "related_to",
        })
      ).toThrow("Invalid source type");
    });

    it("throws on invalid targetType", () => {
      expect(() =>
        Link.create({
          sourceType: "session",
          sourceId: "id-1",
          targetType: "invalid" as EntityType,
          targetId: "id-2",
          relationship: "related_to",
        })
      ).toThrow("Invalid target type");
    });

    it("throws on invalid relationship", () => {
      expect(() =>
        Link.create({
          sourceType: "session",
          sourceId: "id-1",
          targetType: "session",
          targetId: "id-2",
          relationship: "invalid" as LinkType,
        })
      ).toThrow("Invalid relationship type");
    });

    it("throws on weight below 0", () => {
      expect(() =>
        Link.create({
          sourceType: "session",
          sourceId: "id-1",
          targetType: "session",
          targetId: "id-2",
          relationship: "related_to",
          weight: -0.1,
        })
      ).toThrow("Weight must be between 0 and 1");
    });

    it("throws on weight above 1", () => {
      expect(() =>
        Link.create({
          sourceType: "session",
          sourceId: "id-1",
          targetType: "session",
          targetId: "id-2",
          relationship: "related_to",
          weight: 1.5,
        })
      ).toThrow("Weight must be between 0 and 1");
    });

    it("accepts weight of 0", () => {
      const link = Link.create({
        sourceType: "session",
        sourceId: "id-1",
        targetType: "session",
        targetId: "id-2",
        relationship: "related_to",
        weight: 0,
      });
      expect(link.weight).toBe(0);
    });
  });

  describe("entity types", () => {
    it("supports session entity type", () => {
      const link = Link.create({
        sourceType: "session",
        sourceId: "s1",
        targetType: "session",
        targetId: "s2",
        relationship: "continues",
      });
      expect(link.sourceType).toBe("session");
    });

    it("supports message entity type", () => {
      const link = Link.create({
        sourceType: "message",
        sourceId: "m1",
        targetType: "message",
        targetId: "m2",
        relationship: "related_to",
      });
      expect(link.sourceType).toBe("message");
    });

    it("supports topic entity type", () => {
      const link = Link.create({
        sourceType: "message",
        sourceId: "m1",
        targetType: "topic",
        targetId: "auth",
        relationship: "mentions",
      });
      expect(link.targetType).toBe("topic");
    });
  });

  describe("relationship types", () => {
    it("supports mentions relationship", () => {
      const link = Link.create({
        sourceType: "message",
        sourceId: "m1",
        targetType: "topic",
        targetId: "t1",
        relationship: "mentions",
      });
      expect(link.relationship).toBe("mentions");
    });

    it("supports related_to relationship", () => {
      const link = Link.create({
        sourceType: "session",
        sourceId: "s1",
        targetType: "session",
        targetId: "s2",
        relationship: "related_to",
      });
      expect(link.relationship).toBe("related_to");
    });

    it("supports continues relationship", () => {
      const link = Link.create({
        sourceType: "session",
        sourceId: "s1",
        targetType: "session",
        targetId: "s2",
        relationship: "continues",
      });
      expect(link.relationship).toBe("continues");
    });
  });

  describe("identity", () => {
    it("generates composite id from properties", () => {
      const link = Link.create({
        sourceType: "session",
        sourceId: "s1",
        targetType: "session",
        targetId: "s2",
        relationship: "related_to",
      });

      expect(link.id).toBe("session:s1->session:s2:related_to");
    });

    it("equality is based on composite id", () => {
      const link1 = Link.create({
        sourceType: "session",
        sourceId: "s1",
        targetType: "session",
        targetId: "s2",
        relationship: "related_to",
      });
      const link2 = Link.create({
        sourceType: "session",
        sourceId: "s1",
        targetType: "session",
        targetId: "s2",
        relationship: "related_to",
        weight: 0.5, // Different weight, same identity
      });

      expect(link1.equals(link2)).toBe(true);
    });

    it("different relationships are not equal", () => {
      const link1 = Link.create({
        sourceType: "session",
        sourceId: "s1",
        targetType: "session",
        targetId: "s2",
        relationship: "related_to",
      });
      const link2 = Link.create({
        sourceType: "session",
        sourceId: "s1",
        targetType: "session",
        targetId: "s2",
        relationship: "continues",
      });

      expect(link1.equals(link2)).toBe(false);
    });
  });

  describe("immutability", () => {
    it("withWeight returns new instance with updated weight", () => {
      const link = Link.create({
        sourceType: "session",
        sourceId: "s1",
        targetType: "session",
        targetId: "s2",
        relationship: "related_to",
        weight: 0.5,
      });

      const updated = link.withWeight(0.8);

      expect(link.weight).toBe(0.5);
      expect(updated.weight).toBe(0.8);
      expect(link).not.toBe(updated);
    });

    it("withWeight validates new weight", () => {
      const link = Link.create({
        sourceType: "session",
        sourceId: "s1",
        targetType: "session",
        targetId: "s2",
        relationship: "related_to",
      });

      expect(() => link.withWeight(1.5)).toThrow("Weight must be between 0 and 1");
    });
  });
});
