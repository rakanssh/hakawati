import { afterEach, describe, expect, it, vi } from "vitest";
import { isMobilePlatform } from "./platform";

const MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)";

function stubDevice(userAgent: string, maxTouchPoints: number) {
  vi.stubGlobal("navigator", {
    userAgent,
    maxTouchPoints,
    platform: "MacIntel",
  });
  vi.stubGlobal("__TAURI_INTERNALS__", {});
}

describe("isMobilePlatform", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("treats an iPad, whose web view reports a Mac, as mobile", () => {
    stubDevice(MAC_UA, 5);
    expect(isMobilePlatform()).toBe(true);
  });

  it("keeps the macOS app on the desktop layout", () => {
    stubDevice(MAC_UA, 0);
    expect(isMobilePlatform()).toBe(false);
  });
});
