import { describe, expect, it, vi } from "vitest";
import type { CatalogTransport } from "@/services/catalog.service";
import { selectCatalogReadTransport } from "./useCatalogScenarios";

function transport(): CatalogTransport {
  return {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  };
}

describe("selectCatalogReadTransport", () => {
  it("uses authentication when available and otherwise stays public", () => {
    const publicTransport = transport();
    const authTransport = transport();

    expect(selectCatalogReadTransport({ publicTransport, authTransport })).toBe(
      authTransport,
    );
    expect(
      selectCatalogReadTransport({ publicTransport, authTransport: null }),
    ).toBe(publicTransport);
  });
});
