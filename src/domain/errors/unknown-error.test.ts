import { describe, expect, it } from "bun:test";

import { unknownErrorMessage, unknownToError } from "./unknown-error.js";

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

describe("unknownToError", () => {
  it("preserves Error instances", () => {
    const error = new Error("already structured");

    expect(unknownToError(error)).toBe(error);
  });

  it("wraps non-Error throwables", () => {
    const error = unknownToError("plain failure");

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("plain failure");
  });
});
