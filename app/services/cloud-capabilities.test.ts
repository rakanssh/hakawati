import { describe, expect, it } from "vitest";

import {
  cloudFeatureAvailable,
  compareVersions,
  parseCloudCapabilities,
} from "./cloud-capabilities";

describe("cloud capabilities", () => {
  it("accepts the explicit compatible contract", () => {
    const parsed = parseCloudCapabilities(fixture());
    expect(parsed).not.toBeNull();
    expect(cloudFeatureAvailable(parsed, "sync")).toBe(true);
  });

  it("fails closed for missing fields, incompatible clients, and unavailable features", () => {
    expect(parseCloudCapabilities({ server: "hakawati-cloud" })).toBeNull();

    const incompatible = parseCloudCapabilities(
      fixture({ compatibility: { state: "unsupported", reason: "old" } }),
    );
    expect(cloudFeatureAvailable(incompatible, "sync")).toBe(false);

    const serverMisreportedCompatibility = parseCloudCapabilities(
      fixture({ minimumClientVersion: "1.0.0" }),
    );
    expect(cloudFeatureAvailable(serverMisreportedCompatibility, "sync")).toBe(
      false,
    );

    const unavailable = parseCloudCapabilities(
      fixture({
        features: {
          ...fixture().features,
          publishing: { state: "unavailable", reason: "budget_exhausted" },
        },
      }),
    );
    expect(cloudFeatureAvailable(unavailable, "publishing")).toBe(false);
  });
});

describe("semantic version compatibility", () => {
  it.each([
    ["1.0.0-10", "1.0.0-2", 1],
    ["1.0.0-beta.10", "1.0.0-beta.2", 1],
    ["1.0.0-2", "1.0.0-beta", -1],
    ["1.0.0-alpha", "1.0.0-alpha.1", -1],
    ["1.0.0-A", "1.0.0-a", -1],
    ["1.0.0", "1.0.0-99", 1],
    ["1.0.0+build.1", "1.0.0+build.2", 0],
    ["1.0.0-9007199254740993", "1.0.0-9007199254740992", 1],
  ])("compares %s against %s by SemVer precedence", (left, right, expected) => {
    expect(Math.sign(compareVersions(left, right))).toBe(expected);
    expect(Math.sign(compareVersions(right, left))).toBe(
      expected === 0 ? 0 : -expected,
    );
  });

  it.each([
    "01.0.0",
    "1.0.0-01",
    "1.0.0-beta..1",
    "1.0.0+",
    "1.0.0-?",
    "1.0.0+build..2",
    "1.0.0\n",
    " 1.0.0",
    "1.0.0 ",
  ])("fails closed for malformed client or minimum version %s", (version) => {
    expect(compareVersions(version, "0.0.0")).toBeLessThan(0);
    expect(compareVersions("99.0.0", version)).toBeLessThan(0);
  });
});

function fixture(overrides: Record<string, unknown> = {}) {
  return {
    server: "hakawati-cloud",
    apiVersion: "1",
    minimumClientVersion: "0.15.2",
    compatibility: { state: "compatible" },
    cloudSaveProtocol: 1,
    features: {
      sync: { state: "available" },
      catalogRead: { state: "available" },
      coverStorage: { state: "available" },
      publishing: { state: "available" },
    },
    limits: {
      maxPackageBytes: 1024,
      maxStateBytes: 1024,
    },
    scenarioCatalog: {
      packageFormatVersion: 1,
      thumbnailUploads: "enabled",
    },
    ...overrides,
  };
}
