import { describe, expect, it } from "bun:test";

import { unknownErrorMessage } from "./unknown-error.js";

describe("unknownErrorMessage", () => {
  it("uses Error.message for Error instances", () => {
    expect(unknownErrorMessage(new Error("disk full"))).toBe("disk full");
  });

  it("stringifies non-Error throwables", () => {
    expect(unknownErrorMessage("permission denied")).toBe("permission denied");
    expect(unknownErrorMessage(404)).toBe("404");
    expect(unknownErrorMessage(null)).toBe("null");
  });
});

