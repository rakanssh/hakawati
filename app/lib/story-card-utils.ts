import { StoryCard, StorybookCategory } from "@/types/context.type";

type StoryCardLike = Pick<StoryCard, "id" | "title" | "triggers" | "content"> &
  Partial<Pick<StoryCard, "category" | "isPinned" | "createdAt" | "updatedAt">>;

export function normalizeStorybookCategory(
  category: string | undefined,
): StorybookCategory {
  const validCategories = Object.values(StorybookCategory) as string[];
  return category && validCategories.includes(category)
    ? (category as StorybookCategory)
    : StorybookCategory.UNCATEGORIZED;
}

export function normalizeStoryCard(card: StoryCardLike): StoryCard {
  const now = Date.now();
  return {
    id: card.id,
    title: card.title,
    triggers: card.triggers || [],
    content: card.content,
    category: normalizeStorybookCategory(card.category),
    isPinned: card.isPinned || false,
    createdAt: card.createdAt || now,
    updatedAt: card.updatedAt || now,
  };
}
