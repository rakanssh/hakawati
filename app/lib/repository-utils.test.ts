import { describe, expect, it } from "vitest";
import { toUint8Array } from "./repository-utils";

describe("SQLite thumbnail decoding", () => {
  it("preserves the byte arrays returned for native SQLite BLOB columns", () => {
    expect(toUint8Array([0, 137, 255])).toEqual(new Uint8Array([0, 137, 255]));
  });

  it("continues reading existing JSON and typed-array representations", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(toUint8Array("[1,2,3]")).toEqual(bytes);
    expect(toUint8Array(bytes)).toBe(bytes);
    expect(toUint8Array(null)).toBeNull();
  });
});
