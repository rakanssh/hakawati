export const CATALOG_MAX_TAGS = 16;
export const CATALOG_MAX_TAG_LENGTH = 32;

export type CatalogTagValidation = {
  tags: string[];
  invalid: string[];
  tooLong: string[];
  tooMany: boolean;
};

export function normalizeCatalogTag(tag: string): string {
  return tag
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function normalizeCatalogTags(tags: string[] = []): string[] {
  return [...new Set(tags.map(normalizeCatalogTag).filter(Boolean))];
}

export function splitCatalogTagInput(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function validateCatalogTags(tags: string[]): CatalogTagValidation {
  const seen = new Set<string>();
  const normalized: string[] = [];
  const invalid: string[] = [];
  const tooLong: string[] = [];

  for (const raw of tags) {
    const tag = normalizeCatalogTag(raw);
    if (!tag) continue;
    if (!/^[a-z0-9-]+$/.test(tag)) {
      invalid.push(raw);
      continue;
    }
    if (tag.length > CATALOG_MAX_TAG_LENGTH) {
      tooLong.push(tag);
      continue;
    }
    if (!seen.has(tag)) {
      seen.add(tag);
      normalized.push(tag);
    }
  }

  return {
    tags: normalized.slice(0, CATALOG_MAX_TAGS),
    invalid,
    tooLong,
    tooMany: normalized.length > CATALOG_MAX_TAGS,
  };
}
