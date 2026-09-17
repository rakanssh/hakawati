import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameMode, type Scenario } from "@/types/context.type";
import {
  useCatalogActions,
  type CatalogClientState,
} from "./useCatalogScenarios";

const publishing = vi.hoisted(() => ({
  accept: vi.fn(),
  upload: vi.fn(),
  publish: vi.fn(),
}));
vi.mock("@/services/catalog.service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/catalog.service")>()),
  acceptCurrentCatalogPolicies: publishing.accept,
  uploadPublicCatalogThumbnail: publishing.upload,
  publishScenarioDraft: publishing.publish,
}));

const roots: ReturnType<typeof createRoot>[] = [];
function actions(thumbnailUploads = true) {
  const authTransport = { get: vi.fn(), post: vi.fn(), patch: vi.fn() };
  const client: CatalogClientState = {
    baseUrl: "https://cloud.example",
    signedIn: true,
    enabled: true,
    publishingEnabled: true,
    thumbnailUploads,
    loading: false,
    error: null,
    capabilities: null,
    publicTransport: authTransport,
    authTransport,
    refreshCapabilities: vi.fn(),
  };
  let result!: ReturnType<typeof useCatalogActions>;
  function Harness() {
    result = useCatalogActions(client);
    return null;
  }
  const root = createRoot(document.createElement("div"));
  roots.push(root);
  act(() => root.render(createElement(Harness)));
  return { result, authTransport };
}

const scenario = (): Scenario => ({
  id: "local-1",
  name: "Current draft name",
  description: "Current draft description",
  initialGameMode: GameMode.STORY_TELLER,
  content: [],
  thumbnail: null,
});
const policyAcceptance = { termsVersion: "1", communityGuidelinesVersion: "1" };

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  publishing.upload.mockResolvedValue({ assetId: "cover-current" });
});
afterEach(() => roots.splice(0).forEach((root) => act(() => root.unmount())));

describe("publishing the unified local draft", () => {
  it("uploads the current draft cover and publishes the same draft with tags", async () => {
    const draft = {
      ...scenario(),
      thumbnail: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    };
    const { result, authTransport } = actions();
    await result.publish({
      scenario: draft,
      tags: ["space"],
      policyAcceptance,
    });
    expect(publishing.upload).toHaveBeenCalledWith(authTransport, {
      bytes: draft.thumbnail,
      contentType: "image/png",
    });
    expect(publishing.publish).toHaveBeenCalledWith({
      transport: authTransport,
      localScenarioId: draft.id,
      scenario: draft,
      metadata: { tags: ["space"] },
      thumbnailAssetId: "cover-current",
    });
  });

  it("explicitly removes the public cover when the draft has no cover", async () => {
    const { result } = actions(false);
    await result.publish({
      scenario: scenario(),
      tags: ["space"],
      policyAcceptance,
    });
    expect(publishing.upload).not.toHaveBeenCalled();
    expect(publishing.publish).toHaveBeenCalledWith(
      expect.objectContaining({ thumbnailAssetId: null }),
    );
  });

  it("does not silently publish without a draft cover when uploads are unavailable", async () => {
    const { result } = actions(false);
    const draft = {
      ...scenario(),
      thumbnail: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    };
    await expect(
      result.publish({ scenario: draft, tags: ["space"], policyAcceptance }),
    ).rejects.toThrow("Cover uploads are currently unavailable");
    expect(publishing.accept).not.toHaveBeenCalled();
    expect(publishing.publish).not.toHaveBeenCalled();
  });
});
