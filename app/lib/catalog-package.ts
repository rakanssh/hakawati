import { z } from "zod";
import {
  CATALOG_AGE_RATINGS,
  CATALOG_CATEGORIES,
  type CatalogAgeRating,
  type CatalogCategory,
  type CatalogStartSource,
  type ScenarioPackage,
} from "@/types/catalog.type";
import type { Scenario } from "@/types/context.type";
import type { TaleSourceMetadata } from "@/types/tale.type";
import {
  packageContentToScenarioContent,
  scenarioContentToPackage,
} from "@/lib/scenario-content";

const SCENARIO_PACKAGE_MAX_BYTES = 512 * 1024;
const CATALOG_MAX_TAGS = 12;
const CATALOG_MAX_TAG_LENGTH = 32;

const nonBlankString = (max: number) => z.string().trim().min(1).max(max);
const optionalString = (max: number) => z.string().trim().max(max).optional();
const contentId = nonBlankString(64);

const scenarioContentSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("prompt_component"),
      version: z.literal(1),
      id: contentId,
      promptType: z.enum(["ai_instructions", "plot", "author_note", "opening"]),
      content: nonBlankString(8000),
    })
    .strict(),
  z
    .object({
      type: z.literal("story_card"),
      version: z.literal(1),
      id: contentId,
      title: nonBlankString(160),
      triggers: z.array(nonBlankString(80)).max(32),
      content: nonBlankString(4000),
      category: z.enum([
        "Character",
        "Thing",
        "Place",
        "Concept",
        "Uncategorized",
      ]),
      isPinned: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("stat"),
      version: z.literal(1),
      id: contentId,
      name: nonBlankString(80),
      description: optionalString(600),
      value: z.number().finite(),
      range: z.tuple([z.number().finite(), z.number().finite()]),
    })
    .strict(),
  z
    .object({
      type: z.literal("inventory_item"),
      version: z.literal(1),
      id: contentId,
      name: nonBlankString(120),
      description: optionalString(600),
    })
    .strict(),
]);

const scenarioPackageSchema = z.object({
  format: z.literal("hakawati-scenario-package"),
  formatVersion: z.literal(1),
  scenario: z
    .object({
      title: nonBlankString(160),
      summary: nonBlankString(600),
      language: nonBlankString(16).regex(/^[A-Za-z0-9-]+$/),
      category: z.enum(CATALOG_CATEGORIES),
      tags: z
        .array(nonBlankString(CATALOG_MAX_TAG_LENGTH))
        .max(CATALOG_MAX_TAGS),
      ageRating: z.enum(CATALOG_AGE_RATINGS),
      initialGameMode: z.enum(["story_teller", "gm"]),
      description: z.string().trim().max(4000).default(""),
      content: z.array(scenarioContentSchema),
    })
    .strict(),
});

export type ScenarioPackageMetadata = {
  title?: string;
  summary?: string;
  language?: string;
  category?: CatalogCategory;
  tags?: string[];
  ageRating?: CatalogAgeRating;
};

export function normalizeCatalogTags(tags: string[] = []): string[] {
  return [
    ...new Set(
      tags
        .flatMap((tag) => tag.split(","))
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

export function parseScenarioPackage(value: unknown): ScenarioPackage {
  const sizeBytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
  if (sizeBytes > SCENARIO_PACKAGE_MAX_BYTES) {
    throw new Error("Scenario package is too large");
  }

  const parsed = scenarioPackageSchema.parse(value) as ScenarioPackage;
  const content = packageContentToScenarioContent(parsed.scenario.content);
  assertContentLimits(content);

  return {
    ...parsed,
    scenario: {
      ...parsed.scenario,
      tags: normalizeCatalogTags(parsed.scenario.tags),
      content,
    },
  };
}

export function buildScenarioPackage(
  scenario: Scenario,
  metadata: ScenarioPackageMetadata = {},
): ScenarioPackage {
  const title = metadata.title?.trim() || scenario.name.trim() || "Untitled";
  return parseScenarioPackage({
    format: "hakawati-scenario-package",
    formatVersion: 1,
    scenario: {
      title,
      summary: metadata.summary?.trim() || scenario.description.trim() || title,
      language: metadata.language?.trim() || "en",
      category: metadata.category ?? "other",
      tags: normalizeCatalogTags(metadata.tags),
      ageRating: metadata.ageRating ?? "general",
      initialGameMode: scenario.initialGameMode,
      description: scenario.description,
      content: scenarioContentToPackage(scenario.content),
    },
  });
}

export function catalogStartSourceToTaleSource(
  source: CatalogStartSource,
): TaleSourceMetadata {
  return {
    type: "catalog",
    scenarioId: source.catalogScenarioId,
    scenarioVersionId: source.catalogScenarioVersionId,
    scenarioTitle: source.title,
  };
}

function assertContentLimits(content: ScenarioPackage["scenario"]["content"]) {
  const counts = {
    prompt_component: 0,
    story_card: 0,
    stat: 0,
    inventory_item: 0,
  };

  for (const item of content) {
    counts[item.type] += 1;
    if (item.type === "stat" && item.range[0] > item.range[1]) {
      throw new Error(
        "Stat range minimum must be less than or equal to maximum",
      );
    }
  }

  if (
    counts.prompt_component > 50 ||
    counts.story_card > 200 ||
    counts.stat > 50 ||
    counts.inventory_item > 100
  ) {
    throw new Error("Scenario package has too much content");
  }
}
