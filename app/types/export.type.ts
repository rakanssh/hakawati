import type { Scenario } from "./context.type";
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
  ScenarioExportDataV1
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
  name: z.string(),
  initialGameMode: z.string(),
  initialDescription: z.string(),
  initialAuthorNote: z.string(),
  initialStats: z.array(StatV1Schema),
  initialInventory: z.array(z.string()),
  initialStoryCards: z.array(StoryCardV1Schema),
  openingText: z.string(),
});

export const ScenarioV1Schema = z.object({
  type: z.literal("hakawati.scenario"),
  version: z.literal(1),
  exportedAt: z.string(),
  data: ScenarioExportDataV1Schema,
});
