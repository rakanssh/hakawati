import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@lingui/core/macro", () => ({
  msg: (value: TemplateStringsArray | string) =>
    typeof value === "string" ? value : value.join(""),
}));

const mocks = vi.hoisted(() => ({
  transports: {
    publicTransport: null as object | null,
    authTransport: null as object | null,
    readTransport: null as object | null,
    signedIn: false,
  },
  unpublish: vi.fn(),
}));
vi.mock("@/services/catalog-client", () => ({
  currentCatalogTransports: () => mocks.transports,
}));
vi.mock("@/services/catalog.service", () => ({
  fetchCatalogCapabilities: async () => ({}),
  canUseScenarioCatalog: () => true,
  listCatalogScenarios: async () => ({
    items: [
      {
        id: "c1",
        title: "Pirate Cove",
        summary: "Salt and gold.",
        tags: ["pirates"],
        author: { id: "a", displayName: "Rana" },
        startCount: 4,
      },
    ],
    nextCursor: null,
  }),
  listOwnedCatalogScenarios: async () => ({
    items: [
      {
        id: "c2",
        title: "My Cove",
        summary: "",
        tags: [],
        author: { id: "me", displayName: "Me" },
        startCount: 0,
        status: "published",
      },
    ],
  }),
  unpublishCatalogScenario: mocks.unpublish,
}));

const { createCatalogTools } = await import("./catalog");

let answer = true;
const call = (args: Record<string, unknown>) =>
  createCatalogTools({
    getPathname: () => "/",
    confirm: async () => answer,
  })[0].run(args, undefined);

beforeEach(() => {
  vi.clearAllMocks();
  answer = true;
  Object.assign(mocks.transports, {
    publicTransport: {},
    authTransport: null,
    readTransport: {},
    signedIn: false,
  });
});

describe("catalog", () => {
  it("searches the public catalog", async () => {
    expect(await call({ action: "search", query: "pirates" })).toEqual({
      scenarios: [
        {
          id: "c1",
          title: "Pirate Cove",
          summary: "Salt and gold.",
          tags: ["pirates"],
          author: "Rana",
          starts: 4,
        },
      ],
    });
  });

  it("explains when there is no server or the player is signed out", async () => {
    await expect(call({ action: "published" })).rejects.toThrow(
      /isn't signed in/,
    );
    mocks.transports.publicTransport = null;
    mocks.transports.readTransport = null;
    await expect(call({ action: "search" })).rejects.toThrow(/No cloud server/);
  });

  it("unpublishes the player's own scenario only after they say yes", async () => {
    mocks.transports.authTransport = {};
    answer = false;
    expect(await call({ action: "unpublish", id: "c2" })).toEqual({
      done: false,
      cancelled: true,
    });
    expect(mocks.unpublish).not.toHaveBeenCalled();
    answer = true;
    expect(await call({ action: "unpublish", id: "c2" })).toEqual({
      unpublished: "My Cove",
    });
    await expect(call({ action: "unpublish", id: "c1" })).rejects.toThrow(
      /isn't one of the player's/,
    );
  });
});
