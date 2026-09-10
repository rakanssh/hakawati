import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appLocalDataDir: vi.fn(),
  join: vi.fn(),
  load: vi.fn(),
  execute: vi.fn(),
  select: vi.fn(),
  close: vi.fn(),
}));

vi.mock("@tauri-apps/api/path", () => ({
  appLocalDataDir: mocks.appLocalDataDir,
  join: mocks.join,
}));
vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: mocks.load } }));

describe("database initialization", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    mocks.appLocalDataDir.mockResolvedValue("/app-data");
    mocks.join.mockResolvedValue("/app-data/hakawati-dev.db");
    mocks.execute.mockResolvedValue({ rowsAffected: 0 });
    mocks.select.mockResolvedValue([{ foreign_keys: 1 }]);
    mocks.close.mockResolvedValue(true);
    mocks.load.mockResolvedValue({
      execute: mocks.execute,
      select: mocks.select,
      close: mocks.close,
    });
  });

  it("shares initialization while the native data directory is still resolving", async () => {
    let resolveDirectory!: (directory: string) => void;
    mocks.appLocalDataDir.mockReturnValue(
      new Promise<string>((resolve) => {
        resolveDirectory = resolve;
      }),
    );
    const { getDb } = await import("./index");
    const first = getDb();
    const second = getDb();
    expect(first).toBe(second);
    expect(mocks.appLocalDataDir).toHaveBeenCalledTimes(1);
    resolveDirectory("/app-data");
    expect(await first).toBe(await second);
    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it("allows a fresh attempt after initialization fails", async () => {
    mocks.appLocalDataDir.mockRejectedValueOnce(
      new Error("Directory unavailable"),
    );
    const { getDb } = await import("./index");
    await expect(getDb()).rejects.toThrow("Directory unavailable");
    await expect(getDb()).resolves.toBeDefined();
    expect(mocks.appLocalDataDir).toHaveBeenCalledTimes(2);
    expect(mocks.load).toHaveBeenCalledTimes(1);
  });

  it("closes a pool that fails the foreign-key check before retrying", async () => {
    mocks.select.mockResolvedValueOnce([{ foreign_keys: 0 }]);
    const { getDb } = await import("./index");
    await expect(getDb()).rejects.toThrow("foreign key enforcement");
    expect(mocks.close).toHaveBeenCalledTimes(1);
    await expect(getDb()).resolves.toBeDefined();
    expect(mocks.load).toHaveBeenCalledTimes(2);
  });
});
