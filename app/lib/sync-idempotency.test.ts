import { describe, expect, it } from "vitest";
import { createUploadIdempotencyKey } from "./sync-idempotency";

describe("createUploadIdempotencyKey", () => {
  it("bounds a 128-character local tale ID to a 71-character ASCII key", async () => {
    const localTaleId = "a".repeat(128);

    const key = await createUploadIdempotencyKey(
      "hosted",
      "account-1",
      localTaleId,
      1002,
    );

    expect(localTaleId).toHaveLength(128);
    expect(key).toBe(
      "upload-474a71f6b63facfe55524c8b00d6dfc505848841615e00dbf6320f95f881d1b6",
    );
    expect(key).toHaveLength(71);
    expect(key).toMatch(/^upload-[0-9a-f]{64}$/);
  });

  it("hashes a non-ASCII local tale ID as UTF-8 into an ASCII key", async () => {
    const key = await createUploadIdempotencyKey(
      "hosted",
      "account-1",
      "حكاية-١٢٨",
      1002,
    );

    expect(key).toBe(
      "upload-147c2696e805972b5210e29de6adb4eedc30c8320030ae5e045ed7b19f679463",
    );
    expect(key).toHaveLength(71);
    expect(key).toMatch(/^upload-[0-9a-f]{64}$/);
  });

  it("is stable for one tuple and changes when any tuple component changes", async () => {
    const tuple = ["hosted", "account-1", "local-sync", 1002] as const;
    const stableKeys = await Promise.all([
      createUploadIdempotencyKey(...tuple),
      createUploadIdempotencyKey(...tuple),
    ]);
    const changedKeys = await Promise.all([
      createUploadIdempotencyKey("personal", tuple[1], tuple[2], tuple[3]),
      createUploadIdempotencyKey(tuple[0], "personal", tuple[2], tuple[3]),
      createUploadIdempotencyKey(tuple[0], tuple[1], "local-next", tuple[3]),
      createUploadIdempotencyKey(tuple[0], tuple[1], tuple[2], 1003),
    ]);

    expect(stableKeys[1]).toBe(stableKeys[0]);
    expect(new Set([stableKeys[0], ...changedKeys]).size).toBe(5);
  });
});
