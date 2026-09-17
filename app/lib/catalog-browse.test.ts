import {
  defaultParseSearch,
  defaultStringifySearch,
} from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import {
  catalogBrowseSearch,
  readCatalogBrowseSearch,
  type CatalogBrowseState,
} from "./catalog-browse";

describe("catalog browse URL filters", () => {
  it("round-trips generated detail links with the originating browse filters", () => {
    const browse: CatalogBrowseState = {
      tab: "published",
      q: "1984 & the gate?",
      tag: ["sci-fi", "123", "true"],
      sort: "updated",
    };
    const search = defaultParseSearch(
      defaultStringifySearch({
        ...catalogBrowseSearch(browse),
        owned: "1",
      }),
    );
    expect(readCatalogBrowseSearch(search)).toEqual(browse);
    expect(search).toMatchObject({ owned: "1" });
  });

  it.each([
    ["?tab=discover&q=1984&tag=123", "1984", "123"],
    ["?tab=discover&q=true&tag=false", "true", "false"],
    ["?tab=discover&q=null&tag=null", "null", "null"],
  ])("keeps text filters from the direct URL %s", (url, q, tag) => {
    expect(readCatalogBrowseSearch(defaultParseSearch(url))).toEqual({
      tab: "discover",
      q,
      tag: [tag],
      sort: "newest",
    });
  });

  it("normalizes repeated tags and safely defaults malformed or missing filters", () => {
    expect(
      readCatalogBrowseSearch(
        defaultParseSearch("?tab=published&tag=Sci%20Fi&tag=sci-fi&tag=123"),
      ),
    ).toEqual({
      tab: "published",
      q: "",
      tag: ["sci-fi", "123"],
      sort: "updated",
    });
    expect(
      readCatalogBrowseSearch(
        {
          tab: ["discover"],
          q: {},
          tag: ["Fantasy", {}],
          sort: "unknown",
        },
        "published",
      ),
    ).toEqual({ tab: "published", q: "", tag: ["fantasy"], sort: "updated" });
  });
});
