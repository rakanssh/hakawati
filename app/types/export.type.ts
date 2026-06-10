import type { Scenario } from "./context.type";
import { PromptComponentType } from "./context.type";
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
