import type { ScenarioContent } from "./context.type";

export const CATALOG_SORTS = [
  "popular",
  "newest",
  "updated",
  "most_started",
] as const;

export const CATALOG_TAG_SORTS = ["popular", "hot", "name"] as const;

export type CatalogSort = (typeof CATALOG_SORTS)[number];
export type CatalogTagSort = (typeof CATALOG_TAG_SORTS)[number];
export type CatalogScenarioStatus =
  | "published"
  | "unpublished"
  | "hidden"
  | "removed";
export type CatalogModerationStatus = "approved" | "rejected" | "needs_review";

export type ScenarioPackage = {
  format: "hakawati-scenario-package";
  formatVersion: 1;
  scenario: {
    title: string;
    summary: string;
    tags: string[];
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
  tags: string[];
  author: {
    id: string;
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

export type CatalogOwnedModeration = {
  status: CatalogModerationStatus;
  reason: string | null;
  moderatedAt: string | null;
};

export type CatalogOwnedScenarioRecord = CatalogScenarioRecord & {
  moderation: CatalogOwnedModeration;
};

export type CatalogOwnedScenarioDetail = CatalogOwnedScenarioRecord & {
  package: ScenarioPackage;
};

export type CatalogOwnedScenarioPage = {
  items: CatalogOwnedScenarioRecord[];
  nextCursor: string | null;
};

export type CatalogTagSuggestion = {
  tag: string;
  count: number;
};

export type CatalogTagSuggestionPage = {
  items: CatalogTagSuggestion[];
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
