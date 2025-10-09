import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildMessage } from "./promptBuilder";
import { LogEntryMode, LogEntryRole } from "@/types/log.type";
import { GameMode, StorybookCategory } from "@/types/context.type";
import { ResponseMode } from "@/types";
import type { ChatMessage, LLMModel } from "./schema";
import type { LogEntry } from "@/types/log.type";
import type { StoryCard } from "@/types";
import { TaleStoreType } from "@/store";
import { SettingsStoreType } from "@/store/useSettingsStore";

// Mock dependencies
vi.mock("./tokenCounter", () => ({
  countMessageTokens: vi.fn((messages) => {
    // Simple mock: count characters in content
    return messages.reduce(
      (sum: number, msg: ChatMessage) => sum + msg.content.length,
      0,
    );
  }),
}));

vi.mock("@/store/useSettingsStore", () => ({
  useSettingsStore: {
    getState: vi.fn(() => ({
      contextWindow: 4000,
      maxTokens: 1000,
    })),
  },
}));

vi.mock("@/store/useTaleStore", () => ({
  useTaleStore: {
    getState: vi.fn(() => ({
      log: [],
      oldestLoadedIndex: 0,
      totalLogCount: 0,
      ensureLogEntriesLoaded: vi.fn(),
    })),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    warning: vi.fn(),
  },
}));

vi.mock("@/prompts/system", () => ({
  GM_SYSTEM_PROMPT: "You are a game master.",
  STORY_TELLER_SYSTEM_PROMPT: "You are a storyteller.",
  CONTINUE_SYSTEM_PROMPT: "Continue the story.",
  CONTINUE_AUTHOR_NOTE: "Continue from where you left off.",
}));

// Test helpers
const createMockModel = (overrides?: Partial<LLMModel>): LLMModel => ({
  id: "test-model",
  name: "Test Model",
  contextLength: 4000,
  ...overrides,
});

const createMockLogEntry = (overrides?: Partial<LogEntry>): LogEntry => ({
  id: "entry-1",
  role: LogEntryRole.PLAYER,
  text: "Test message",
  mode: LogEntryMode.DO,
  ...overrides,
});

const createMockStoryCard = (overrides?: Partial<StoryCard>): StoryCard => ({
  id: "card-1",
  title: "Test Card",
  content: "Test content",
  triggers: ["test"],
  category: StorybookCategory.UNCATEGORIZED,
  isPinned: false,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  ...overrides,
});

describe("promptBuilder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("buildMessage - Basic Functionality", () => {
    it("should build a basic message with minimal params", async () => {
      const result = await buildMessage({
        log: [],
        stats: [],
        inventory: [],
        lastMessage: { text: "Hello", mode: LogEntryMode.DO },
        description: "",
        authorNote: "",
        storyCards: [],
        model: createMockModel(),
        gameMode: GameMode.STORY_TELLER,
        responseMode: ResponseMode.FREE_FORM,
      });

      expect(result).toBeDefined();
      expect(result.model).toBe("test-model");
      expect(result.messages).toHaveLength(2); // system + user
      expect(result.messages[0].role).toBe("system");
      expect(result.messages[1].role).toBe("user");
      expect(result.messages[1].content).toContain("Action: Hello");
    });

    it("should include description and author note when provided", async () => {
      const result = await buildMessage({
        log: [],
        stats: [],
        inventory: [],
        lastMessage: { text: "Hello", mode: LogEntryMode.DO },
        description: "A dark forest",
        authorNote: "Keep it mysterious",
        storyCards: [],
        model: createMockModel(),
        gameMode: GameMode.STORY_TELLER,
        responseMode: ResponseMode.FREE_FORM,
      });

      expect(result.messages).toHaveLength(4); // system + description + authorNote + user
      expect(result.messages[1].content).toBe("A dark forest");
      expect(result.messages[2].content).toBe("Keep it mysterious");
    });
  });

  describe("buildMessage - Game Modes", () => {
    it("should use GM system prompt in GM mode", async () => {
      const result = await buildMessage({
        log: [],
        stats: [{ name: "HP", value: 100, range: [0, 100] }],
        inventory: [{ id: "1", name: "Sword" }],
        lastMessage: { text: "Attack", mode: LogEntryMode.DO },
        description: "",
        authorNote: "",
        storyCards: [],
        model: createMockModel(),
        gameMode: GameMode.GM,
        responseMode: ResponseMode.RESPONSE_FORMAT,
      });

      expect(result.messages[0].content).toBe("You are a game master.");
      expect(result.messages[result.messages.length - 1].content).toContain(
        "**Game State:**",
      );
      expect(result.messages[result.messages.length - 1].content).toContain(
        "HP",
      );
      expect(result.messages[result.messages.length - 1].content).toContain(
        "Sword",
      );
    });

    it("should use storyteller prompt in story teller mode", async () => {
      const result = await buildMessage({
        log: [],
        stats: [],
        inventory: [],
        lastMessage: { text: "Continue", mode: LogEntryMode.STORY },
        description: "",
        authorNote: "",
        storyCards: [],
        model: createMockModel(),
        gameMode: GameMode.STORY_TELLER,
        responseMode: ResponseMode.FREE_FORM,
      });

      expect(result.messages[0].content).toBe("You are a storyteller.");
      expect(result.responseMode).toBe(ResponseMode.FREE_FORM);
    });
  });

  describe("buildMessage - Log Entry Modes", () => {
    it("should format DO mode correctly", async () => {
      const result = await buildMessage({
        log: [],
        stats: [],
        inventory: [],
        lastMessage: { text: "open door", mode: LogEntryMode.DO },
        description: "",
        authorNote: "",
        storyCards: [],
        model: createMockModel(),
        gameMode: GameMode.STORY_TELLER,
        responseMode: ResponseMode.FREE_FORM,
      });

      const userMsg = result.messages[result.messages.length - 1];
      expect(userMsg.content).toBe("Action: open door");
    });

    it("should format SAY mode correctly", async () => {
      const result = await buildMessage({
        log: [],
        stats: [],
        inventory: [],
        lastMessage: { text: "Hello there", mode: LogEntryMode.SAY },
        description: "",
        authorNote: "",
        storyCards: [],
        model: createMockModel(),
        gameMode: GameMode.STORY_TELLER,
        responseMode: ResponseMode.FREE_FORM,
      });

      const userMsg = result.messages[result.messages.length - 1];
      expect(userMsg.content).toBe('You say: "Hello there"');
    });

    it("should format DIRECT mode correctly", async () => {
      const result = await buildMessage({
        log: [],
        stats: [],
        inventory: [],
        lastMessage: { text: "Make it scary", mode: LogEntryMode.DIRECT },
        description: "",
        authorNote: "",
        storyCards: [],
        model: createMockModel(),
        gameMode: GameMode.STORY_TELLER,
        responseMode: ResponseMode.FREE_FORM,
      });

      const userMsg = result.messages[result.messages.length - 1];
      expect(userMsg.content).toBe("[Director's Note: Make it scary]");
    });

    it("should format STORY mode correctly", async () => {
      const result = await buildMessage({
        log: [],
        stats: [],
        inventory: [],
        lastMessage: { text: "The wind howls", mode: LogEntryMode.STORY },
        description: "",
        authorNote: "",
        storyCards: [],
        model: createMockModel(),
        gameMode: GameMode.STORY_TELLER,
        responseMode: ResponseMode.FREE_FORM,
      });

      const userMsg = result.messages[result.messages.length - 1];
      expect(userMsg.content).toBe("The wind howls");
    });

    it("should add continue note for CONTINUE mode", async () => {
      const result = await buildMessage({
        log: [],
        stats: [],
        inventory: [],
        lastMessage: { text: "", mode: LogEntryMode.CONTINUE },
        description: "",
        authorNote: "",
        storyCards: [],
        model: createMockModel(),
        gameMode: GameMode.STORY_TELLER,
        responseMode: ResponseMode.FREE_FORM,
      });

      const hasContinueNote = result.messages.some(
        (msg) => msg.content === "Continue from where you left off.",
      );
      expect(hasContinueNote).toBe(true);
    });
  });

  describe("buildMessage - Story Cards", () => {
    it("should include pinned cards regardless of triggers", async () => {
      const pinnedCard = createMockStoryCard({
        id: "pinned-1",
        title: "Pinned Card",
        content: "Always visible",
        triggers: ["never-mentioned"],
        isPinned: true,
      });

      const result = await buildMessage({
        log: [],
        stats: [],
        inventory: [],
        lastMessage: { text: "Hello", mode: LogEntryMode.DO },
        description: "",
        authorNote: "",
        storyCards: [pinnedCard],
        model: createMockModel(),
        gameMode: GameMode.STORY_TELLER,
        responseMode: ResponseMode.FREE_FORM,
      });

      const storybookMsg = result.messages.find((msg) =>
        msg.content.includes("**StoryBook:**"),
      );
      expect(storybookMsg).toBeDefined();
      expect(storybookMsg?.content).toContain("Pinned Card");
      expect(storybookMsg?.content).toContain("Always visible");
    });

    it("should trigger cards based on log content", async () => {
      const { useTaleStore } = await import("@/store/useTaleStore");
      vi.mocked(useTaleStore.getState).mockReturnValue({
        log: [
          createMockLogEntry({
            id: "1",
            role: LogEntryRole.PLAYER,
            text: "I see a dragon",
            mode: LogEntryMode.DO,
          }),
        ],
        oldestLoadedIndex: 0,
        totalLogCount: 1,
        ensureLogEntriesLoaded: vi.fn(),
      } as unknown as TaleStoreType);

      const dragonCard = createMockStoryCard({
        id: "dragon-1",
        title: "Dragon",
        content: "A fearsome beast",
        triggers: ["dragon"],
        isPinned: false,
      });

      const result = await buildMessage({
        log: [],
        stats: [],
        inventory: [],
        lastMessage: { text: "What do I do?", mode: LogEntryMode.DO },
        description: "",
        authorNote: "",
        storyCards: [dragonCard],
        model: createMockModel(),
        gameMode: GameMode.STORY_TELLER,
        responseMode: ResponseMode.FREE_FORM,
      });

      const storybookMsg = result.messages.find((msg) =>
        msg.content.includes("**StoryBook:**"),
      );
      expect(storybookMsg).toBeDefined();
      expect(storybookMsg?.content).toContain("Dragon");
      expect(storybookMsg?.content).toContain("A fearsome beast");
    });

    it("should not trigger cards that are not mentioned", async () => {
      const { useTaleStore } = await import("@/store/useTaleStore");
      vi.mocked(useTaleStore.getState).mockReturnValue({
        log: [
          createMockLogEntry({
            id: "1",
            role: LogEntryRole.PLAYER,
            text: "I walk forward",
            mode: LogEntryMode.DO,
          }),
        ],
        oldestLoadedIndex: 0,
        totalLogCount: 1,
        ensureLogEntriesLoaded: vi.fn(),
      } as unknown as TaleStoreType);

      const dragonCard = createMockStoryCard({
        id: "dragon-1",
        title: "Dragon",
        content: "A fearsome beast",
        triggers: ["dragon"],
        isPinned: false,
      });

      const result = await buildMessage({
        log: [],
        stats: [],
        inventory: [],
        lastMessage: { text: "Continue walking", mode: LogEntryMode.DO },
        description: "",
        authorNote: "",
        storyCards: [dragonCard],
        model: createMockModel(),
        gameMode: GameMode.STORY_TELLER,
        responseMode: ResponseMode.FREE_FORM,
      });

      const storybookMsg = result.messages.find((msg) =>
        msg.content.includes("**StoryBook:**"),
      );
      expect(storybookMsg).toBeUndefined();
    });

    it("should combine pinned and triggered cards", async () => {
      const { useTaleStore } = await import("@/store/useTaleStore");
      vi.mocked(useTaleStore.getState).mockReturnValue({
        log: [
          createMockLogEntry({
            id: "1",
            role: LogEntryRole.PLAYER,
            text: "I see a dragon",
            mode: LogEntryMode.DO,
          }),
        ],
        oldestLoadedIndex: 0,
        totalLogCount: 1,
        ensureLogEntriesLoaded: vi.fn(),
      } as unknown as TaleStoreType);

      const pinnedCard = createMockStoryCard({
        id: "pinned-1",
        title: "Hero",
        content: "You are brave",
        triggers: [],
        isPinned: true,
      });

      const dragonCard = createMockStoryCard({
        id: "dragon-1",
        title: "Dragon",
        content: "A fearsome beast",
        triggers: ["dragon"],
        isPinned: false,
      });

      const result = await buildMessage({
        log: [],
        stats: [],
        inventory: [],
        lastMessage: { text: "Fight it", mode: LogEntryMode.DO },
        description: "",
        authorNote: "",
        storyCards: [pinnedCard, dragonCard],
        model: createMockModel(),
        gameMode: GameMode.STORY_TELLER,
        responseMode: ResponseMode.FREE_FORM,
      });

      const storybookMsg = result.messages.find((msg) =>
        msg.content.includes("**StoryBook:**"),
      );
      expect(storybookMsg).toBeDefined();
      expect(storybookMsg?.content).toContain("Hero");
      expect(storybookMsg?.content).toContain("Dragon");
    });

    it("should include multiple cards that share the same trigger", async () => {
      const { useTaleStore } = await import("@/store/useTaleStore");
      vi.mocked(useTaleStore.getState).mockReturnValue({
        log: [
          createMockLogEntry({
            id: "1",
            role: LogEntryRole.PLAYER,
            text: "I see a dragon in the cave",
            mode: LogEntryMode.DO,
          }),
        ],
        oldestLoadedIndex: 0,
        totalLogCount: 1,
        ensureLogEntriesLoaded: vi.fn(),
      } as unknown as TaleStoreType);

      const dragonCard = createMockStoryCard({
        id: "dragon-1",
        title: "Dragon",
        content: "A fearsome beast",
        triggers: ["dragon"],
      });

      const dragonLoreCard = createMockStoryCard({
        id: "dragon-2",
        title: "Dragon Lore",
        content: "Legends about dragons",
        triggers: ["dragon"],
      });

      const result = await buildMessage({
        log: [],
        stats: [],
        inventory: [],
        lastMessage: { text: "Approach the dragon", mode: LogEntryMode.DO },
        description: "",
        authorNote: "",
        storyCards: [dragonCard, dragonLoreCard],
        model: createMockModel(),
        gameMode: GameMode.STORY_TELLER,
        responseMode: ResponseMode.FREE_FORM,
      });

      const storybookMsg = result.messages.find((msg) =>
        msg.content.includes("**StoryBook:**"),
      );
      expect(storybookMsg).toBeDefined();
      expect(storybookMsg?.content).toContain("Dragon");
      expect(storybookMsg?.content).toContain("Dragon Lore");
    });
  });

  describe("buildMessage - Conversation History", () => {
    it("should include conversation history", async () => {
      const { useTaleStore } = await import("@/store/useTaleStore");
      vi.mocked(useTaleStore.getState).mockReturnValue({
        log: [
          createMockLogEntry({
            id: "1",
            role: LogEntryRole.PLAYER,
            text: "Hello",
            mode: LogEntryMode.SAY,
          }),
          createMockLogEntry({
            id: "2",
            role: LogEntryRole.GM,
            text: "Greetings, traveler",
            mode: LogEntryMode.STORY,
          }),
        ],
        oldestLoadedIndex: 0,
        totalLogCount: 2,
        ensureLogEntriesLoaded: vi.fn(),
      } as unknown as TaleStoreType);

      const result = await buildMessage({
        log: [],
        stats: [],
        inventory: [],
        lastMessage: { text: "Where am I?", mode: LogEntryMode.SAY },
        description: "",
        authorNote: "",
        storyCards: [],
        model: createMockModel(),
        gameMode: GameMode.STORY_TELLER,
        responseMode: ResponseMode.FREE_FORM,
      });

      // Should have: system, history (2 messages), user
      expect(result.messages.length).toBeGreaterThanOrEqual(3);
      const userMessages = result.messages.filter((m) => m.role === "user");
      const assistantMessages = result.messages.filter(
        (m) => m.role === "assistant",
      );
      expect(userMessages.length).toBeGreaterThanOrEqual(1);
      expect(assistantMessages.length).toBeGreaterThanOrEqual(1);
    });

    it("should request additional history when the loaded window is incomplete", async () => {
      const { useTaleStore } = await import("@/store/useTaleStore");
      const ensureLogEntriesLoaded = vi.fn().mockResolvedValue(undefined);
      const shortLog = Array.from({ length: 20 }, (_, i) =>
        createMockLogEntry({
          id: `log-${i}`,
          role: i % 2 === 0 ? LogEntryRole.PLAYER : LogEntryRole.GM,
          text: `Message ${i}`,
        }),
      );
      vi.mocked(useTaleStore.getState).mockReturnValue({
        log: shortLog,
        oldestLoadedIndex: 5,
        totalLogCount: 150,
        ensureLogEntriesLoaded,
      } as unknown as TaleStoreType);

      await buildMessage({
        log: [],
        stats: [],
        inventory: [],
        lastMessage: { text: "Where am I?", mode: LogEntryMode.SAY },
        description: "",
        authorNote: "",
        storyCards: [],
        model: createMockModel(),
        gameMode: GameMode.STORY_TELLER,
        responseMode: ResponseMode.FREE_FORM,
      });

      expect(ensureLogEntriesLoaded).toHaveBeenCalledWith(100);
    });

    it("should merge consecutive GM entries with same chainId", async () => {
      const { useTaleStore } = await import("@/store/useTaleStore");
      vi.mocked(useTaleStore.getState).mockReturnValue({
        log: [
          createMockLogEntry({
            id: "1",
            role: LogEntryRole.GM,
            text: "Part 1",
            mode: LogEntryMode.STORY,
            chainId: "chain-1",
          }),
          createMockLogEntry({
            id: "2",
            role: LogEntryRole.GM,
            text: " Part 2",
            mode: LogEntryMode.STORY,
            chainId: "chain-1",
          }),
        ],
        oldestLoadedIndex: 0,
        totalLogCount: 2,
        ensureLogEntriesLoaded: vi.fn(),
      } as unknown as TaleStoreType);

      const result = await buildMessage({
        log: [],
        stats: [],
        inventory: [],
        lastMessage: { text: "Continue", mode: LogEntryMode.DO },
        description: "",
        authorNote: "",
        storyCards: [],
        model: createMockModel(),
        gameMode: GameMode.STORY_TELLER,
        responseMode: ResponseMode.FREE_FORM,
      });

      const assistantMessages = result.messages.filter(
        (m) => m.role === "assistant",
      );
      expect(assistantMessages).toHaveLength(1);
      expect(assistantMessages[0].content).toBe("Part 1 Part 2");
    });

    it("should skip empty GM responses", async () => {
      const { useTaleStore } = await import("@/store/useTaleStore");
      vi.mocked(useTaleStore.getState).mockReturnValue({
        log: [
          createMockLogEntry({
            id: "1",
            role: LogEntryRole.GM,
            text: "...",
            mode: LogEntryMode.STORY,
          }),
          createMockLogEntry({
            id: "2",
            role: LogEntryRole.GM,
            text: "   ",
            mode: LogEntryMode.STORY,
          }),
          createMockLogEntry({
            id: "3",
            role: LogEntryRole.GM,
            text: "Real content",
            mode: LogEntryMode.STORY,
          }),
        ],
        oldestLoadedIndex: 0,
        totalLogCount: 3,
        ensureLogEntriesLoaded: vi.fn(),
      } as unknown as TaleStoreType);

      const result = await buildMessage({
        log: [],
        stats: [],
        inventory: [],
        lastMessage: { text: "Continue", mode: LogEntryMode.DO },
        description: "",
        authorNote: "",
        storyCards: [],
        model: createMockModel(),
        gameMode: GameMode.STORY_TELLER,
        responseMode: ResponseMode.FREE_FORM,
      });

      const assistantMessages = result.messages.filter(
        (m) => m.role === "assistant",
      );
      expect(assistantMessages).toHaveLength(1);
      expect(assistantMessages[0].content).toBe("Real content");
    });

    it("should filter out the current user message from history", async () => {
      const { useTaleStore } = await import("@/store/useTaleStore");
      vi.mocked(useTaleStore.getState).mockReturnValue({
        log: [
          createMockLogEntry({
            id: "1",
            role: LogEntryRole.PLAYER,
            text: "First message",
          }),
          createMockLogEntry({
            id: "2",
            role: LogEntryRole.PLAYER,
            text: "Current message",
          }),
        ],
        oldestLoadedIndex: 0,
        totalLogCount: 2,
        ensureLogEntriesLoaded: vi.fn(),
      } as unknown as TaleStoreType);

      const result = await buildMessage({
        log: [],
        stats: [],
        inventory: [],
        lastMessage: { text: "Current message", mode: LogEntryMode.DO },
        description: "",
        authorNote: "",
        storyCards: [],
        model: createMockModel(),
        gameMode: GameMode.STORY_TELLER,
        responseMode: ResponseMode.FREE_FORM,
      });

      const userMessages = result.messages.filter((m) => m.role === "user");
      // Should only have the final user message, not the duplicate from history
      const currentMsgCount = userMessages.filter((m) =>
        m.content.includes("Current message"),
      ).length;
      expect(currentMsgCount).toBe(1);
    });
  });

  describe("buildMessage - Token Budget Management", () => {
    it("should respect context window limits", async () => {
      const { useSettingsStore } = await import("@/store/useSettingsStore");
      vi.mocked(useSettingsStore.getState).mockReturnValue({
        contextWindow: 100, // Very small
        maxTokens: 20,
      } as unknown as SettingsStoreType);

      const { useTaleStore } = await import("@/store/useTaleStore");
      const longHistory = Array.from({ length: 50 }, (_, i) =>
        createMockLogEntry({
          id: `entry-${i}`,
          role: i % 2 === 0 ? LogEntryRole.PLAYER : LogEntryRole.GM,
          text: `Message ${i} with some content`,
        }),
      );

      vi.mocked(useTaleStore.getState).mockReturnValue({
        log: longHistory,
        oldestLoadedIndex: 0,
        totalLogCount: 50,
        ensureLogEntriesLoaded: vi.fn(),
      } as unknown as TaleStoreType);

      const result = await buildMessage({
        log: [],
        stats: [],
        inventory: [],
        lastMessage: { text: "Hello", mode: LogEntryMode.DO },
        description: "",
        authorNote: "",
        storyCards: [],
        model: createMockModel({ contextLength: 100 }),
        gameMode: GameMode.STORY_TELLER,
        responseMode: ResponseMode.FREE_FORM,
      });

      // Should have limited history due to token budget
      expect(result.messages.length).toBeLessThan(longHistory.length + 2);
    });

    it("should use model context length when smaller than settings", async () => {
      const { useSettingsStore } = await import("@/store/useSettingsStore");
      vi.mocked(useSettingsStore.getState).mockReturnValue({
        contextWindow: 8000,
        maxTokens: 1000,
      } as unknown as SettingsStoreType);

      const longInput = "x".repeat(1500);
      const { toast } = await import("sonner");

      const result = await buildMessage({
        log: [],
        stats: [],
        inventory: [],
        lastMessage: { text: longInput, mode: LogEntryMode.DO },
        description: "",
        authorNote: "",
        storyCards: [],
        model: createMockModel({ contextLength: 2000 }), // Smaller than settings
        gameMode: GameMode.STORY_TELLER,
        responseMode: ResponseMode.FREE_FORM,
      });

      expect(result).toBeDefined();
      expect(vi.mocked(toast.warning)).toHaveBeenCalledWith(
        expect.stringContaining("only 1000 are available."),
      );
    });

    it("should warn when pinned cards consume the entire prompt budget", async () => {
      const { useSettingsStore } = await import("@/store/useSettingsStore");
      vi.mocked(useSettingsStore.getState).mockReturnValue({
        contextWindow: 250,
        maxTokens: 50,
      } as unknown as SettingsStoreType);

      const { toast } = await import("sonner");

      const pinnedCard = createMockStoryCard({
        id: "pinned-overflow",
        isPinned: true,
        content: "Pinned ".repeat(40),
      });

      await buildMessage({
        log: [],
        stats: [],
        inventory: [],
        lastMessage: { text: "Hi", mode: LogEntryMode.DO },
        description: "",
        authorNote: "",
        storyCards: [pinnedCard],
        model: createMockModel({ contextLength: 250 }),
        gameMode: GameMode.STORY_TELLER,
        responseMode: ResponseMode.FREE_FORM,
      });

      expect(vi.mocked(toast.warning)).toHaveBeenCalledWith(
        expect.stringContaining("pinned cards use"),
      );
    });
  });

  describe("buildMessage - Edge Cases", () => {
    it("should handle empty log", async () => {
      const result = await buildMessage({
        log: [],
        stats: [],
        inventory: [],
        lastMessage: { text: "Start", mode: LogEntryMode.DO },
        description: "",
        authorNote: "",
        storyCards: [],
        model: createMockModel(),
        gameMode: GameMode.STORY_TELLER,
        responseMode: ResponseMode.FREE_FORM,
      });

      expect(result.messages).toHaveLength(2); // system + user
    });

    it("should handle empty story cards", async () => {
      const result = await buildMessage({
        log: [],
        stats: [],
        inventory: [],
        lastMessage: { text: "Hello", mode: LogEntryMode.DO },
        description: "",
        authorNote: "",
        storyCards: [],
        model: createMockModel(),
        gameMode: GameMode.STORY_TELLER,
        responseMode: ResponseMode.FREE_FORM,
      });

      const storybookMsg = result.messages.find((msg) =>
        msg.content.includes("**StoryBook:**"),
      );
      expect(storybookMsg).toBeUndefined();
    });

    it("should handle empty stats and inventory in GM mode", async () => {
      const result = await buildMessage({
        log: [],
        stats: [],
        inventory: [],
        lastMessage: { text: "Start", mode: LogEntryMode.DO },
        description: "",
        authorNote: "",
        storyCards: [],
        model: createMockModel(),
        gameMode: GameMode.GM,
        responseMode: ResponseMode.RESPONSE_FORMAT,
      });

      const userMsg = result.messages[result.messages.length - 1];
      expect(userMsg.content).toContain("**Game State:**");
      expect(userMsg.content).toContain("Stats: []");
      expect(userMsg.content).toContain("Inventory: []");
    });

    it("should handle case-insensitive trigger matching", async () => {
      const { useTaleStore } = await import("@/store/useTaleStore");
      vi.mocked(useTaleStore.getState).mockReturnValue({
        log: [
          createMockLogEntry({
            id: "1",
            text: "I see a DRAGON flying",
          }),
        ],
        oldestLoadedIndex: 0,
        totalLogCount: 1,
        ensureLogEntriesLoaded: vi.fn(),
      } as unknown as TaleStoreType);

      const dragonCard = createMockStoryCard({
        triggers: ["dragon"],
      });

      const result = await buildMessage({
        log: [],
        stats: [],
        inventory: [],
        lastMessage: { text: "Run", mode: LogEntryMode.DO },
        description: "",
        authorNote: "",
        storyCards: [dragonCard],
        model: createMockModel(),
        gameMode: GameMode.STORY_TELLER,
        responseMode: ResponseMode.FREE_FORM,
      });

      const storybookMsg = result.messages.find((msg) =>
        msg.content.includes("**StoryBook:**"),
      );
      expect(storybookMsg).toBeDefined();
    });

    it("should not duplicate cards with multiple matching triggers", async () => {
      const { useTaleStore } = await import("@/store/useTaleStore");
      vi.mocked(useTaleStore.getState).mockReturnValue({
        log: [
          createMockLogEntry({
            id: "1",
            text: "The red dragon breathes fire",
          }),
        ],
        oldestLoadedIndex: 0,
        totalLogCount: 1,
        ensureLogEntriesLoaded: vi.fn(),
      } as unknown as TaleStoreType);

      const dragonCard = createMockStoryCard({
        id: "dragon-1",
        title: "Dragon",
        triggers: ["dragon", "fire", "red"],
      });

      const result = await buildMessage({
        log: [],
        stats: [],
        inventory: [],
        lastMessage: { text: "Defend", mode: LogEntryMode.DO },
        description: "",
        authorNote: "",
        storyCards: [dragonCard],
        model: createMockModel(),
        gameMode: GameMode.STORY_TELLER,
        responseMode: ResponseMode.FREE_FORM,
      });

      const storybookMsg = result.messages.find((msg) =>
        msg.content.includes("**StoryBook:**"),
      );
      expect(storybookMsg).toBeDefined();
      // Count occurrences of the card title
      const titleCount = (storybookMsg?.content.match(/Dragon/g) || []).length;
      expect(titleCount).toBe(1); // Should appear only once
    });
  });

  describe("buildMessage - Message Order", () => {
    it("should maintain correct message order: meta, storybook, history, user", async () => {
      const { useTaleStore } = await import("@/store/useTaleStore");
      vi.mocked(useTaleStore.getState).mockReturnValue({
        log: [
          createMockLogEntry({
            id: "1",
            role: LogEntryRole.PLAYER,
            text: "Hello",
          }),
          createMockLogEntry({
            id: "2",
            role: LogEntryRole.GM,
            text: "Hi there",
          }),
        ],
        oldestLoadedIndex: 0,
        totalLogCount: 2,
        ensureLogEntriesLoaded: vi.fn(),
      } as unknown as TaleStoreType);

      const pinnedCard = createMockStoryCard({
        isPinned: true,
      });

      const result = await buildMessage({
        log: [],
        stats: [],
        inventory: [],
        lastMessage: { text: "How are you?", mode: LogEntryMode.SAY },
        description: "Test description",
        authorNote: "Test note",
        storyCards: [pinnedCard],
        model: createMockModel(),
        gameMode: GameMode.STORY_TELLER,
        responseMode: ResponseMode.FREE_FORM,
      });

      // Verify order
      expect(result.messages[0].role).toBe("system"); // System prompt
      expect(result.messages[1].role).toBe("system"); // Description
      expect(result.messages[2].role).toBe("system"); // Author note
      expect(result.messages[3].role).toBe("system"); // Storybook
      expect(result.messages[3].content).toContain("**StoryBook:**");
      // History messages
      // Last message should be user
      expect(result.messages[result.messages.length - 1].role).toBe("user");
    });
  });
});
