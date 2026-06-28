import type { ScenarioContent } from "./context.type";

export const CATALOG_CATEGORIES = [
  "fantasy",
  "sci_fi",
  "horror",
  "mystery",
  "romance",
  "slice_of_life",
  "historical",
  "fandom",
  "other",
] as const;

export const CATALOG_AGE_RATINGS = ["general", "teen", "mature"] as const;

export const CATALOG_SORTS = [
  "popular",
  "newest",
  "updated",
  "most_started",
] as const;

export type CatalogCategory = (typeof CATALOG_CATEGORIES)[number];
export type CatalogAgeRating = (typeof CATALOG_AGE_RATINGS)[number];
export type CatalogSort = (typeof CATALOG_SORTS)[number];
export type CatalogScenarioStatus =
  | "published"
  | "unpublished"
  | "hidden"
  | "removed";

export type ScenarioPackage = {
  format: "hakawati-scenario-package";
  formatVersion: 1;
  scenario: {
    title: string;
    summary: string;
    language: string;
    category: CatalogCategory;
    tags: string[];
    ageRating: CatalogAgeRating;
    initialGameMode: "story_teller" | "gm";
    description: string;
    content: ScenarioContent[];
  };
};

export type CoverAssetReference = {
  assetId: string;
  visibility: "private" | "public";
  contentType: string;
  byteSize: number;
  sha256: string;
  width: number | null;
  height: number | null;
  downloadUrl: string;
  urlExpiresAt: string | null;
};

export type CatalogScenarioRecord = {
  id: string;
  currentVersionId: string | null;
  status: CatalogScenarioStatus;
  title: string;
  summary: string;
  language: string;
  category: CatalogCategory;
  tags: string[];
  ageRating: CatalogAgeRating;
  author: {
    displayName: string;
  };
  thumbnail: CoverAssetReference | null;
  viewCount: number;
  startCount: number;
  updatedAt: string;
  publishedAt: string | null;
};

export type CatalogScenarioDetail = CatalogScenarioRecord & {
  package: ScenarioPackage;
};

export type CatalogScenarioPage = {
  items: CatalogScenarioRecord[];
  nextCursor: string | null;
};

export type CatalogStartSource = {
  type: "catalog";
  catalogScenarioId: string;
  catalogScenarioVersionId: string;
  title: string;
};

export type CatalogStartResponse = {
  scenario: ScenarioPackage["scenario"];
  source: CatalogStartSource;
  package: ScenarioPackage;
};

export type ScenarioPublishLink = {
  localScenarioId: string;
  catalogScenarioId: string;
  catalogScenarioVersionId: string | null;
  lastPublishedAt: number;
};
