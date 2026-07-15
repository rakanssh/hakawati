import { describe, expect, it } from "vitest";

import {
  cloudFeatureAvailable,
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
