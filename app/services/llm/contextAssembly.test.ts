import { beforeEach, describe, expect, it, vi } from "vitest";
import { StorybookCategory, type StoryCard } from "@/types/context.type";
import { LogEntryMode, LogEntryRole, type LogEntry } from "@/types/log.type";
import {
  assembleContextMessages,
  injectMode,
  type AssembleContextMessagesParams,
} from "./contextAssembly";
import type { ChatMessage } from "./schema";
import { countMessageTokens } from "./tokenCounter";

vi.mock("@/prompts", () => ({
  getActiveContinuePrompt: () => "Continue the story.",
}));

const tokenizer = vi.hoisted(() => ({
  recording: false,
  inputs: [] as string[],
}));
vi.mock("tiktoken", async (importOriginal) => {
  const tiktoken = await importOriginal<typeof import("tiktoken")>();
  return {
    ...tiktoken,
    get_encoding: (name: Parameters<typeof tiktoken.get_encoding>[0]) => {
      const encoding = tiktoken.get_encoding(name);
      return {
        encode: (text: string) => {
          if (tokenizer.recording) tokenizer.inputs.push(text);
          return encoding.encode(text);
        },
      };
    },
  };
});

type Callback = [string, number?];

// The old algorithm, kept as a reference: selection must not change.
function assembleByRecounting(
  params: AssembleContextMessagesParams,
  onCandidateTotal: (tokens: number) => void = () => {},
) {
  const { log, storyCards, requiredMeta, userMessage, promptBudget } = params;
  const lateMeta = params.lateMeta ?? [];
  const callbacks: Callback[] = [];
  const storyBook = (cards: StoryCard[]): ChatMessage[] =>
    cards.length
      ? [
          {
            role: "system",
            content: cards.reduce(
              (text, card, i) =>
                `${text}\n${i + 1}. ${card.title}\n${card.content}\n`,
              "**StoryBook:**\n",
            ),
          },
        ]
      : [];

  const required = [...requiredMeta, ...lateMeta, userMessage];
  const requiredTokens = countMessageTokens(required);
  if (requiredTokens > promptBudget)
    callbacks.push(["required", requiredTokens]);
  const pinned = storyCards.filter((card) => card.isPinned);
  const withPinned = countMessageTokens([...required, ...storyBook(pinned)]);
  if (withPinned > promptBudget) callbacks.push(["pinned", withPinned]);

  const merged: Array<ChatMessage & { chainKey?: string }> = [];
  const effectiveLog = params.includeLogEntry
    ? log.filter(params.includeLogEntry)
    : log;
  for (const entry of effectiveLog) {
    const content = injectMode(entry.text, entry.mode);
    const last = merged.at(-1);
    const chainKey = entry.chainId ?? entry.id;
    if (entry.role !== LogEntryRole.GM) merged.push({ role: "user", content });
    else if (last?.role === "assistant" && last.chainKey === chainKey)
      last.content += content;
    else merged.push({ role: "assistant", content, chainKey });
  }

  const includedIds = new Set(pinned.map((card) => card.id));
  const included = () => storyCards.filter((card) => includedIds.has(card.id));
  const selected: ChatMessage[] = [];
  let hitTokenLimit = false;
  for (const message of [...merged].reverse()) {
    if (
      message.role === "assistant" &&
      (message.content === "..." || message.content.trim() === "")
    )
      continue;
    const text = message.content.toLowerCase();
    const newCards: StoryCard[] = [];
    for (const card of storyCards) {
      const matches = card.triggers.some(
        (trigger) => trigger && text.includes(trigger.toLowerCase()),
      );
      if (card.isPinned || !matches) continue;
      if (newCards.some((other) => other.id === card.id)) continue;
      if (!includedIds.has(card.id)) newCards.push(card);
    }
    const chatMessage = { role: message.role, content: message.content };
    const total = countMessageTokens([
      ...requiredMeta,
      ...storyBook([...included(), ...newCards]),
      ...selected,
      chatMessage,
      ...lateMeta,
      userMessage,
    ]);
    onCandidateTotal(total);
    if (total > promptBudget) {
      hitTokenLimit = true;
      break;
    }
    selected.unshift(chatMessage);
    newCards.forEach((card) => includedIds.add(card.id));
  }
  if (hitTokenLimit && selected.length === 0) callbacks.push(["no-history"]);

  const messages = [
    ...requiredMeta,
    ...storyBook(included()),
    ...selected,
    ...lateMeta,
    userMessage,
  ];
  return { messages, usedTokens: countMessageTokens(messages), callbacks };
}

function assemble(params: AssembleContextMessagesParams) {
  const callbacks: Callback[] = [];
  const result = assembleContextMessages({
    ...params,
    onRequiredTokensExceeded: (tokens) => callbacks.push(["required", tokens]),
    onRequiredWithPinnedExceeded: (tokens) =>
      callbacks.push(["pinned", tokens]),
    onNoHistoryIncluded: () => callbacks.push(["no-history"]),
  });
  return { ...result, callbacks };
}

function seededRandom(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed / 2 ** 32;
  };
}

// Fragments that tokenize differently once a GM chain joins them.
const words = [
  "The",
  " lantern",
  " lan",
  "tern",
  " hinges",
  " scre",
  "am",
  "Mira",
  " whisp",
  "ers.",
  " gate",
  " Gate 7",
  " drums",
  "\n\n",
  " ",
  " é",
  " 🙂",
];

function randomCase(seed: number) {
  const random = seededRandom(seed);
  const pick = <T>(items: T[]) => items[Math.floor(random() * items.length)];
  const phrase = (max: number) =>
    Array.from({ length: 1 + Math.floor(random() * max) }, () =>
      pick(words),
    ).join("");

  const log: LogEntry[] = [];
  let chainId = "chain-0";
  for (let i = 0; i < Math.floor(random() * 24); i += 1) {
    if (random() < 0.4) {
      log.push({
        id: `entry-${i}`,
        role: LogEntryRole.PLAYER,
        mode: pick([
          LogEntryMode.DO,
          LogEntryMode.SAY,
          LogEntryMode.STORY,
          LogEntryMode.DIRECT,
          undefined,
        ]),
        text: phrase(8),
      });
      continue;
    }
    if (random() < 0.5) chainId = `chain-${i}`;
    log.push({
      id: `entry-${i}`,
      role: LogEntryRole.GM,
      mode: LogEntryMode.STORY,
      text: pick([phrase(12), phrase(4), "...", "", " "]),
      ...(random() < 0.9 ? { chainId } : {}),
    });
  }
  const storyCards: StoryCard[] = Array.from(
    { length: Math.floor(random() * 6) },
    (_, i) => ({
      id: `card-${random() < 0.1 ? 0 : i}`,
      title: phrase(2),
      content: phrase(10),
      triggers: [pick(["gate", "mira", "DRUMS", "lantern", ""]), phrase(1)],
      category: StorybookCategory.CHARACTER,
      isPinned: random() < 0.25,
      createdAt: 0,
      updatedAt: 0,
    }),
  );
  const excluded = random() < 0.3 ? pick(log) : undefined;
  const params: AssembleContextMessagesParams = {
    log,
    storyCards,
    requiredMeta: [
      { role: "system", content: phrase(20) },
      ...(random() < 0.5
        ? [{ role: "system" as const, content: phrase(6) }]
        : []),
    ],
    lateMeta: random() < 0.5 ? [{ role: "system", content: phrase(5) }] : [],
    userMessage: { role: "user", content: phrase(6) },
    promptBudget: Number.POSITIVE_INFINITY,
    ...(excluded ? { includeLogEntry: (entry) => entry !== excluded } : {}),
  };
  return { params, log };
}

function player(id: string, text: string): LogEntry {
  return { id, role: LogEntryRole.PLAYER, mode: LogEntryMode.DO, text };
}

function gm(id: string, text: string, chainId = id): LogEntry {
  return { id, role: LogEntryRole.GM, mode: LogEntryMode.STORY, text, chainId };
}

describe("assembleContextMessages", () => {
  beforeEach(() => {
    tokenizer.recording = false;
    tokenizer.inputs.length = 0;
  });

  it("selects the same history as recounting the whole prompt for every message", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const { params, log } = randomCase(seed);
      const totals: number[] = [];
      assembleByRecounting(params, (total) => totals.push(total));
      const step = Math.ceil(totals.length / 6);
      const boundaries = totals.filter(
        (_, i) => i % step === 0 || i === totals.length - 1,
      );
      const required = countMessageTokens([
        ...params.requiredMeta,
        ...(params.lateMeta ?? []),
        params.userMessage,
      ]);
      const budgets = [
        0,
        required - 1,
        required,
        ...boundaries.flatMap((total) => [total - 1, total]),
      ];
      for (const promptBudget of budgets) {
        expect(
          assemble({ ...params, promptBudget }),
          `seed ${seed} budget ${promptBudget}`,
        ).toEqual(assembleByRecounting({ ...params, promptBudget }));
      }

      const edited = log.find((entry) => entry.text.trim());
      if (!edited) continue;
      edited.text += " The drums answer.";
      for (const promptBudget of budgets) {
        expect(
          assemble({ ...params, promptBudget }),
          `seed ${seed} edited, budget ${promptBudget}`,
        ).toEqual(assembleByRecounting({ ...params, promptBudget }));
      }
    }
  }, 30_000);

  it("counts a continued GM reply as the joined text the model receives", () => {
    const parts = ["Mira whisp", "ers."];
    const count = (content: string) =>
      countMessageTokens([{ role: "assistant", content }]);
    expect(count(parts[0]) + count(parts[1])).toBeGreaterThan(
      count(parts.join("")) + 1,
    );
    const params: AssembleContextMessagesParams = {
      log: [gm("gm-1", parts[0], "chain"), gm("gm-2", parts[1], "chain")],
      storyCards: [],
      requiredMeta: [{ role: "system", content: "You are a narrator." }],
      userMessage: { role: "user", content: "I listen." },
      promptBudget: 0,
    };
    const budget =
      countMessageTokens([...params.requiredMeta, params.userMessage]) +
      count(parts.join(""));

    const result = assemble({ ...params, promptBudget: budget });

    expect(result.messages).toContainEqual({
      role: "assistant",
      content: "Mira whispers.",
    });
    expect(result.usedTokens).toBe(budget);
    expect(assemble({ ...params, promptBudget: budget - 1 }).messages).toEqual([
      ...params.requiredMeta,
      params.userMessage,
    ]);
  });

  describe("tokenizer work", () => {
    const longTale = (entries: number) =>
      Array.from({ length: entries }, (_, i) =>
        i % 2
          ? gm(`gm-${i}`, `The drums beat ${i} times beneath the gate.`)
          : player(`player-${i}`, `I count the drums, ${i}.`),
      );
    const request = (log: LogEntry[]): AssembleContextMessagesParams => ({
      log,
      storyCards: [],
      requiredMeta: [{ role: "system", content: "You are a narrator." }],
      lateMeta: [
        { role: "system", content: "**Author's Note:**\nStay tense." },
      ],
      userMessage: { role: "user", content: "I open the gate." },
      promptBudget: 1_000_000,
    });

    beforeEach(() => {
      tokenizer.recording = true;
    });

    it("counts each history message once and reuses the counts on the next request", () => {
      const log = longTale(200);
      const first = assembleContextMessages(request(log));
      const history = first.messages
        .slice(1, -2)
        .map((message) => message.content);
      expect(history).toHaveLength(200);
      for (const content of history) {
        expect(
          tokenizer.inputs.filter((input) => input === content),
        ).toHaveLength(1);
      }

      tokenizer.inputs.length = 0;
      expect(assembleContextMessages(request(log))).toEqual(first);
      const counted = new Set(history);
      expect(tokenizer.inputs.filter((input) => counted.has(input))).toEqual(
        [],
      );
    });

    it("tokenizes the same text for the next request however long the tale is", () => {
      const nextRequestInputs = (entries: number) => {
        const log = longTale(entries);
        assembleContextMessages(request(log));
        tokenizer.inputs.length = 0;
        assembleContextMessages(request(log));
        return [...tokenizer.inputs];
      };

      expect(nextRequestInputs(1000)).toEqual(nextRequestInputs(20));
    });
  });
});
