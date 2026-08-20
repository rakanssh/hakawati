import type {
  PromptComponent,
  Scenario,
  ScenarioContent,
  StoryCard,
} from "./context.type";
import {
  GameMode,
  PromptComponentType,
  StorybookCategory,
} from "./context.type";
import type { LogEntry } from "./log.type";
import { LogEntryMode, LogEntryRole } from "./log.type";
import type { Item } from "./item.type";
import type { Stat } from "./stats.type";
import type { TaleSourceMetadata } from "./tale.type";
import { z } from "zod";

export type ExportEnvelope<
  TType extends string,
  TVersion extends number,
  TData,
> = {
  type: TType;
  version: TVersion;
  exportedAt: string; // ISO 8601
  data: TData;
};

// Exclude binary thumbnail data to keep clipboard JSON lightweight.
export type ScenarioExportDataV1 = Omit<Scenario, "thumbnail">;

export type ScenarioExportV1 = ExportEnvelope<
  "hakawati.scenario",
  1,
  {
    id?: string;
    name: string;
    initialGameMode: string;
    initialDescription: string;
    initialAuthorNote: string;
    initialStats: Array<{ name: string; value: number; range: number[] }>;
    initialInventory: string[];
    initialStoryCards: Array<{
      id: string;
      title: string;
      triggers: string[];
      content: string;
    }>;
    openingText: string;
  }
>;

export type ScenarioExportDataV2 = Omit<Scenario, "thumbnail">;

export type ScenarioExportV2 = ExportEnvelope<
  "hakawati.scenario",
  2,
  ScenarioExportDataV2
>;

export type ScenarioExportDataV3 = Omit<Scenario, "thumbnail">;

export type ScenarioExportV3 = ExportEnvelope<
  "hakawati.scenario",
  3,
  ScenarioExportDataV3
>;

export const StoryCardV1Schema = z.object({
  id: z.string(),
  title: z.string(),
  triggers: z.array(z.string()),
  content: z.string(),
});

export const StatV1Schema = z.object({
  name: z.string(),
  value: z.number(),
  range: z.array(z.number()),
});

export const ScenarioExportDataV1Schema = z.object({
  id: z.string().optional(),
  name: z.string(),
  initialGameMode: z.string(),
  initialDescription: z.string(),
  initialAuthorNote: z.string(),
  initialStats: z.array(StatV1Schema),
  initialInventory: z.array(z.string()),
  initialStoryCards: z.array(StoryCardV1Schema),
  openingText: z.string(),
});

export const PromptComponentV2Schema = z.object({
  id: z.string(),
  type: z.enum([
    PromptComponentType.AI_INSTRUCTIONS,
    PromptComponentType.PLOT,
    PromptComponentType.AUTHOR_NOTE,
    PromptComponentType.OPENING,
  ]),
  content: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const StoryCardV2Schema = StoryCardV1Schema.extend({
  category: z.string().optional(),
  isPinned: z.boolean().optional(),
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
});

export const ScenarioExportDataV2Schema = z.object({
  id: z.string(),
  name: z.string(),
  initialGameMode: z.string(),
  description: z.string(),
  components: z.array(PromptComponentV2Schema),
  initialStats: z.array(StatV1Schema),
  initialInventory: z.array(z.string()),
  initialStoryCards: z.array(StoryCardV2Schema),
});

export const ScenarioContentSchema: z.ZodType<ScenarioContent> =
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("prompt_component"),
      version: z.literal(1),
      id: z.string(),
      promptType: z.enum([
        PromptComponentType.AI_INSTRUCTIONS,
        PromptComponentType.PLOT,
        PromptComponentType.AUTHOR_NOTE,
        PromptComponentType.OPENING,
      ]),
      content: z.string(),
    }),
    z.object({
      type: z.literal("story_card"),
      version: z.literal(1),
      id: z.string(),
      title: z.string(),
      triggers: z.array(z.string()),
      content: z.string(),
      category: z.enum([
        StorybookCategory.CHARACTER,
        StorybookCategory.THING,
        StorybookCategory.PLACE,
        StorybookCategory.CONCEPT,
        StorybookCategory.UNCATEGORIZED,
      ]),
      isPinned: z.boolean(),
    }),
    z.object({
      type: z.literal("stat"),
      version: z.literal(1),
      id: z.string(),
      name: z.string(),
      description: z.string().optional(),
      value: z.number(),
      range: z.tuple([z.number(), z.number()]),
    }),
    z.object({
      type: z.literal("inventory_item"),
      version: z.literal(1),
      id: z.string(),
      name: z.string(),
      description: z.string().optional(),
    }),
  ]);

export const ScenarioExportDataV3Schema = z.object({
  id: z.string(),
  name: z.string(),
  initialGameMode: z.string(),
  description: z.string(),
  content: z.array(ScenarioContentSchema),
});

export const ScenarioV1Schema = z.object({
  type: z.literal("hakawati.scenario"),
  version: z.literal(1),
  exportedAt: z.string(),
  data: ScenarioExportDataV1Schema,
});

export const ScenarioV2Schema = z.object({
  type: z.literal("hakawati.scenario"),
  version: z.literal(2),
  exportedAt: z.string(),
  data: ScenarioExportDataV2Schema,
});

export const ScenarioV3Schema = z.object({
  type: z.literal("hakawati.scenario"),
  version: z.literal(3),
  exportedAt: z.string(),
  data: ScenarioExportDataV3Schema,
});

export type TalePackageV1 = {
  format: "hakawati-tale-package";
  formatVersion: 1;
  exportedAt: string;
  tale: {
    id: string;
    title: string;
    description: string;
    gameMode: GameMode;
    thumbnailAssetId?: string;
    createdAt: number;
    updatedAt: number;
    schemaVersion: number;
    source?: TaleSourceMetadata;
  };
  state: {
    stateSchemaVersion: number;
    data: {
      components: PromptComponent[];
      storyCards: StoryCard[];
      source?: TaleSourceMetadata;
      gm: {
        stats: Stat[];
        inventory: Item[];
        scratchpad: Record<string, unknown>;
      };
    };
  };
  turns: Array<{
    id: string;
    seq: number;
    createdAt: number;
    updatedAt?: number;
    entries: LogEntry[];
  }>;
  assets: Array<{
    id: string;
    role: "thumbnail";
    contentType: string;
    dataBase64: string;
  }>;
};

export const InventoryItemV1Schema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
});

export const TaleSourceMetadataV1Schema = z.object({
  type: z.enum(["local", "catalog"]),
  scenarioId: z.string(),
  scenarioVersionId: z.string().nullable().optional(),
  scenarioTitle: z.string().nullable().optional(),
});

export const TaleLogEntryV1Schema = z
  .object({
    id: z.string(),
    role: z.enum([LogEntryRole.PLAYER, LogEntryRole.GM]),
    mode: z
      .enum([
        LogEntryMode.SAY,
        LogEntryMode.DO,
        LogEntryMode.STORY,
        LogEntryMode.DIRECT,
        LogEntryMode.CONTINUE,
      ])
      .optional(),
    text: z.string(),
    thinking: z.string().optional(),
    isActionError: z.boolean().optional(),
    actions: z.array(z.unknown()).optional(),
    chainId: z.string().optional(),
    error: z.unknown().optional(),
  })
  .passthrough();

export const TaleStateDataV1Schema = z.object({
  components: z.array(PromptComponentV2Schema),
  storyCards: z.array(StoryCardV2Schema),
  source: TaleSourceMetadataV1Schema.optional(),
  gm: z.object({
    stats: z.array(StatV1Schema),
    inventory: z.array(InventoryItemV1Schema),
    scratchpad: z.record(z.string(), z.unknown()).default({}),
  }),
});

export const TalePackageV1Schema = z.object({
  format: z.literal("hakawati-tale-package"),
  formatVersion: z.literal(1),
  exportedAt: z.string(),
  tale: z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    gameMode: z.enum([GameMode.GM, GameMode.STORY_TELLER]),
    thumbnailAssetId: z.string().optional(),
    createdAt: z.number(),
    updatedAt: z.number(),
    schemaVersion: z.number(),
    source: TaleSourceMetadataV1Schema.optional(),
  }),
  state: z.object({
    stateSchemaVersion: z.number(),
    data: TaleStateDataV1Schema,
  }),
  turns: z.array(
    z.object({
      id: z.string(),
      seq: z.number(),
      createdAt: z.number(),
      updatedAt: z.number().optional(),
      entries: z.array(TaleLogEntryV1Schema),
    }),
  ),
  assets: z
    .array(
      z.object({
        id: z.string(),
        role: z.literal("thumbnail"),
        contentType: z.string(),
        dataBase64: z.string(),
      }),
    )
    .default([]),
});
