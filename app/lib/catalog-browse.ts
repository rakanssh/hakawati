import { validateCatalogTags } from "@/lib/catalog-tags";
import { CATALOG_SORTS, type CatalogSort } from "@/types/catalog.type";

export type ScenarioTab = "local" | "discover" | "published";
export type CatalogBrowseState = {
  tab: ScenarioTab;
  q: string;
  tag: string[];
  sort: CatalogSort;
};

// TanStack's default query parser decodes unquoted JSON scalars in direct URLs.
function searchText(value: unknown): string {
  return value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
    ? String(value)
    : "";
}

export function readCatalogBrowseSearch(
  search: Record<string, unknown>,
  defaultTab: ScenarioTab = "local",
): CatalogBrowseState {
  const tab =
    search.tab === "local" ||
    search.tab === "discover" ||
    search.tab === "published"
      ? search.tab
      : defaultTab;
  const tags = Array.isArray(search.tag)
    ? search.tag.map(searchText)
    : searchText(search.tag).split(",");
  return {
    tab,
    q: searchText(search.q).slice(0, 200),
    tag: validateCatalogTags(tags).tags,
    sort: CATALOG_SORTS.includes(search.sort as CatalogSort)
      ? (search.sort as CatalogSort)
      : tab === "published"
        ? "updated"
        : "newest",
  };
}

export function catalogBrowseSearch(state: CatalogBrowseState) {
  return {
    tab: state.tab,
    q: state.q || undefined,
    tag: state.tag.length ? state.tag : undefined,
    sort: state.sort,
  };
}
