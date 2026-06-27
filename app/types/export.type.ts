import type { PromptComponent, Scenario, StoryCard } from "./context.type";
import { GameMode, PromptComponentType } from "./context.type";
import type { LogEntry } from "./log.type";
import { LogEntryMode, LogEntryRole } from "./log.type";
import type { Item } from "./item.type";
import type { Stat } from "./stats.type";
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
  };
  state: {
    stateSchemaVersion: number;
    data: {
      components: PromptComponent[];
      storyCards: StoryCard[];
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
