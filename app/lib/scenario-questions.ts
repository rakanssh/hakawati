import type { ScenarioContent } from "@/types/context.type";

export type ScenarioQuestion = {
  id: string;
  question: string;
  mode: "text" | "options" | "choices";
  options: string[];
};

export type ScenarioAnswers = Readonly<Record<string, string>>;

type Diagnostic = { field: string; message: string };
type Character = { value: string; escaped: boolean };
type QuestionToken = {
  end: number;
  question?: ScenarioQuestion;
  error?: string;
};
type Segment =
  | { kind: "text"; value: string }
  | { kind: "question"; question: ScenarioQuestion }
  | { kind: "invalid"; value: string; message: string };

const escapedCharacters = new Set(["\\", "$", "{", "}", "|", ":", ","]);
const promptOrder = ["opening", "plot", "author_note", "ai_instructions"];
const promptLabels: Record<string, string> = {
  opening: "Opening text",
  plot: "Plot",
  author_note: "Author note",
  ai_instructions: "AI instructions",
};

/** Collect fields in questionnaire order, independently of storage order. */
function questionFields(content: ScenarioContent[]) {
  const fields: Array<{ field: string; text: string }> = [];
  const add = (field: string, text: string | undefined) => {
    if (text !== undefined) fields.push({ field, text });
  };
  for (const promptType of promptOrder) {
    content.forEach((item) => {
      if (item.type === "prompt_component" && item.promptType === promptType) {
        add(promptLabels[promptType], item.content);
      }
    });
  }
  let cardIndex = 0;
  content.forEach((item) => {
    if (item.type !== "story_card") return;
    const label = `Story card ${++cardIndex}`;
    add(`${label}: title`, item.title);
    add(`${label}: content`, item.content);
    item.triggers.forEach((trigger, triggerIndex) => {
      add(`${label}: trigger ${triggerIndex + 1}`, trigger);
    });
  });
  for (const type of ["stat", "inventory_item"] as const) {
    let itemIndex = 0;
    content.forEach((item) => {
      if (item.type !== type) return;
      const label = `${type === "stat" ? "Stat" : "Inventory item"} ${++itemIndex}`;
      add(`${label}: name`, item.name);
      add(`${label}: description`, item.description);
    });
  }
  return fields;
}

function decoded(characters: Character[]) {
  return characters
    .map(({ value }) => value)
    .join("")
    .trim();
}

function splitCharacters(characters: Character[], delimiter: string) {
  const parts: Character[][] = [[]];
  for (const character of characters) {
    if (!character.escaped && character.value === delimiter) parts.push([]);
    else parts[parts.length - 1].push(character);
  }
  return parts;
}

/** Read a complete token, including malformed/nested tokens, without evaluation. */
function readQuestion(text: string, start: number): QuestionToken {
  const characters: Character[] = [];
  let error: string | undefined;
  let depth = 1;
  let index = start + 2;
  for (; index < text.length; index++) {
    const value = text[index];
    if (value === "\\") {
      const next = text[index + 1];
      if (next === undefined) break;
      if (!escapedCharacters.has(next)) {
        error ??= `Unsupported escape \\${next} in a scenario question.`;
      }
      characters.push({ value: next, escaped: true });
      index++;
    } else if (value === "{") {
      error ??=
        "Nested braces are not allowed in scenario questions; escape literal braces with a backslash.";
      depth++;
      characters.push({ value, escaped: false });
    } else if (value === "}") {
      depth--;
      if (depth === 0) break;
      characters.push({ value, escaped: false });
    } else {
      characters.push({ value, escaped: false });
    }
  }
  if (depth !== 0) {
    return {
      end: text.length,
      error: "Unclosed scenario question; add a closing }.",
    };
  }
  const end = index + 1;
  if (error) return { end, error };

  const parts = splitCharacters(characters, "|");
  if (parts.length > 2) {
    return {
      end,
      error:
        "A scenario question accepts one options or choices clause; escape literal | characters.",
    };
  }
  const question = decoded(parts[0]);
  if (!question)
    return { end, error: "Scenario question text cannot be empty." };
  if (parts.length === 1) {
    return {
      end,
      question: { id: question, question, mode: "text", options: [] },
    };
  }

  const clause = parts[1];
  const colon = clause.findIndex(
    ({ value, escaped }) => value === ":" && !escaped,
  );
  if (colon === -1) {
    return {
      end,
      error: `Question “${question}” needs an options: or choices: clause.`,
    };
  }
  const mode = decoded(clause.slice(0, colon));
  if (mode !== "options" && mode !== "choices") {
    return {
      end,
      error: `Unknown question mode “${mode}”; use options: or choices:.`,
    };
  }
  const options = splitCharacters(clause.slice(colon + 1), ",").map(decoded);
  if (options.some((option) => option.length === 0)) {
    return {
      end,
      error: `Question “${question}” cannot contain empty ${mode}.`,
    };
  }
  if (new Set(options).size !== options.length) {
    return {
      end,
      error: `Question “${question}” contains duplicate ${mode}; each answer must be different.`,
    };
  }
  return { end, question: { id: question, question, mode, options } };
}

function parseText(text: string): Segment[] {
  const segments: Segment[] = [];
  let literal = "";
  let index = 0;
  while (index < text.length) {
    // Only interpret backslashes outside tokens when they precede ${. This
    // preserves ordinary prose, paths, and other backslash sequences verbatim.
    if (text[index] === "\\") {
      let afterSlashes = index;
      while (text[afterSlashes] === "\\") afterSlashes++;
      if (text.startsWith("${", afterSlashes)) {
        const count = afterSlashes - index;
        literal += "\\".repeat(Math.floor(count / 2));
        index = afterSlashes;
        if (count % 2 === 1) {
          const token = readQuestion(text, index);
          literal += text.slice(index, token.end);
          index = token.end;
          continue;
        }
      } else {
        literal += text.slice(index, afterSlashes);
        index = afterSlashes;
        continue;
      }
    }
    if (!text.startsWith("${", index)) {
      literal += text[index++];
      continue;
    }
    if (literal) segments.push({ kind: "text", value: literal });
    literal = "";
    const token = readQuestion(text, index);
    if (token.question)
      segments.push({ kind: "question", question: token.question });
    else {
      segments.push({
        kind: "invalid",
        value: text.slice(index, token.end),
        message: token.error!,
      });
    }
    index = token.end;
  }
  if (literal) segments.push({ kind: "text", value: literal });
  return segments;
}

export function analyzeScenarioQuestions(content: ScenarioContent[]): {
  questions: ScenarioQuestion[];
  diagnostics: Diagnostic[];
} {
  const questions = new Map<string, ScenarioQuestion>();
  const diagnostics: Diagnostic[] = [];
  for (const { field, text } of questionFields(content)) {
    for (const segment of parseText(text)) {
      if (segment.kind === "invalid") {
        diagnostics.push({ field, message: segment.message });
      } else if (segment.kind === "question") {
        const next = segment.question;
        const previous = questions.get(next.id);
        if (!previous || previous.mode === "text") {
          // Map.set preserves first-appearance order when a later occurrence
          // supplies the configuration for an earlier bare reference.
          questions.set(next.id, next);
        } else if (
          next.mode !== "text" &&
          (previous.mode !== next.mode ||
            previous.options.length !== next.options.length ||
            previous.options.some(
              (option, index) => option !== next.options[index],
            ))
        ) {
          diagnostics.push({
            field,
            message: `Question “${next.question}” has conflicting modes or ordered options.`,
          });
        }
      }
    }
  }
  return { questions: [...questions.values()], diagnostics };
}

function assertNoDiagnostics(diagnostics: Diagnostic[]) {
  if (diagnostics.length > 0) {
    throw new Error(
      diagnostics
        .map(({ field, message }) => `${field}: ${message}`)
        .join("\n"),
    );
  }
}

/** Validate authoring syntax without requiring player answers. */
export function assertValidScenarioQuestions(content: ScenarioContent[]): void {
  assertNoDiagnostics(analyzeScenarioQuestions(content).diagnostics);
}

export function getScenarioAnswerError(
  question: ScenarioQuestion,
  value: string | undefined,
): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return `Answer “${question.question}” before starting.`;
  }
  if (question.mode === "choices" && !question.options.includes(value.trim())) {
    return `Choose one of the listed answers for “${question.question}”.`;
  }
  return null;
}

export function resolveScenarioQuestions(
  content: ScenarioContent[],
  answers: ScenarioAnswers = {},
): ScenarioContent[] {
  const analysis = analyzeScenarioQuestions(content);
  assertNoDiagnostics(analysis.diagnostics);
  const values = new Map<string, string>();
  for (const question of analysis.questions) {
    const answer = Object.prototype.hasOwnProperty.call(answers, question.id)
      ? answers[question.id]
      : undefined;
    const error = getScenarioAnswerError(question, answer);
    if (error) throw new Error(error);
    values.set(question.id, answer!.trim());
  }
  const resolve = (text: string) =>
    parseText(text)
      .map((segment) =>
        segment.kind === "question"
          ? values.get(segment.question.id)!
          : segment.value,
      )
      .join("");

  return content.map((item): ScenarioContent => {
    switch (item.type) {
      case "prompt_component":
        return { ...item, content: resolve(item.content) };
      case "story_card":
        return {
          ...item,
          title: resolve(item.title),
          content: resolve(item.content),
          triggers: item.triggers.map(resolve),
        };
      case "stat":
        return {
          ...item,
          name: resolve(item.name),
          ...(item.description !== undefined
            ? { description: resolve(item.description) }
            : {}),
          range: [...item.range],
        };
      case "inventory_item":
        return {
          ...item,
          name: resolve(item.name),
          ...(item.description !== undefined
            ? { description: resolve(item.description) }
            : {}),
        };
    }
  });
}

/** Show readable question labels while preserving deliberately literal tokens. */
export function previewScenarioText(text: string): string {
  return parseText(text)
    .map((segment) =>
      segment.kind === "question" ? segment.question.question : segment.value,
    )
    .join("");
}

/** Split editor trigger lists without splitting commas inside question syntax. */
export function splitScenarioTriggers(text: string): string[] {
  const triggers: string[] = [];
  let start = 0;
  let index = 0;
  const add = (end: number) => {
    const trigger = text.slice(start, end).trim();
    if (trigger) triggers.push(trigger);
  };
  while (index < text.length) {
    if (text.startsWith("${", index)) {
      index = readQuestion(text, index).end;
    } else if (text[index] === ",") {
      add(index);
      start = ++index;
    } else index++;
  }
  add(text.length);
  return triggers;
}
