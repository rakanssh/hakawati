import type { LLMModel } from "@/types/model.type";

export function matchModels(models: LLMModel[], query: string): LLMModel[] {
  const wanted = query.trim().toLowerCase();
  if (!wanted) return [];
  const tests: Array<(model: LLMModel) => boolean> = [
    (model) => model.id.toLowerCase() === wanted,
    (model) => model.name.toLowerCase() === wanted,
    (model) => model.id.toLowerCase().endsWith(`/${wanted}`),
    (model) => {
      const words = wanted.split(/[\s/:._-]+/).filter(Boolean);
      const haystack = `${model.id} ${model.name}`.toLowerCase();
      return words.every((word) => haystack.includes(word));
    },
  ];
  for (const test of tests) {
    const found = models.filter(test);
    if (found.length) return found;
  }
  return [];
}
