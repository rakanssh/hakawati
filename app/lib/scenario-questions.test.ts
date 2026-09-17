import { describe, expect, it } from "vitest";
import {
  PromptComponentType,
  StorybookCategory,
  type ScenarioContent,
} from "@/types/context.type";
import {
  analyzeScenarioQuestions,
  assertValidScenarioQuestions,
  getScenarioAnswerError,
  previewScenarioText,
  resolveScenarioQuestions,
  splitScenarioTriggers,
} from "./scenario-questions";

function prompt(
  content: string,
  promptType = PromptComponentType.OPENING,
): ScenarioContent {
  return {
    type: "prompt_component",
    version: 1,
    id: promptType,
    promptType,
    content,
  };
}

describe("scenario questions", () => {
  it("merges bare references with later definitions and preserves first appearance", () => {
    const content = [
      prompt("${ Name } meets ${Friend}. ${name}"),
      prompt(
        "${Name | choices: A, B} / ${Friend | options: C, D}",
        PromptComponentType.PLOT,
      ),
    ];
    expect(analyzeScenarioQuestions(content)).toEqual({
      questions: [
        { id: "Name", question: "Name", mode: "choices", options: ["A", "B"] },
        {
          id: "Friend",
          question: "Friend",
          mode: "options",
          options: ["C", "D"],
        },
        { id: "name", question: "name", mode: "text", options: [] },
      ],
      diagnostics: [],
    });
    expect(
      resolveScenarioQuestions(content, {
        Name: " A ",
        Friend: "Someone else",
        name: "lower",
      })[0],
    ).toMatchObject({ content: "A meets Someone else. lower" });
  });

  it("uses stable prompt-group then story-card, stat, inventory field order", () => {
    const content: ScenarioContent[] = [
      {
        type: "inventory_item",
        version: 1,
        id: "${ignored}",
        name: "${item}",
        description: "${item detail}",
      },
      {
        type: "stat",
        version: 1,
        id: "stat",
        name: "${stat}",
        description: "${stat detail}",
        value: 3,
        range: [0, 5],
      },
      prompt("${instructions}", PromptComponentType.AI_INSTRUCTIONS),
      {
        type: "story_card",
        version: 1,
        id: "card",
        title: "${title}",
        content: "${body}",
        triggers: ["${trigger}", "${other trigger}"],
        category: StorybookCategory.CHARACTER,
        isPinned: true,
      },
      prompt("${note}", PromptComponentType.AUTHOR_NOTE),
      prompt("${plot}", PromptComponentType.PLOT),
      prompt("${opening 1}"),
      prompt("${opening 2}"),
    ];
    expect(
      analyzeScenarioQuestions(content).questions.map(({ id }) => id),
    ).toEqual([
      "opening 1",
      "opening 2",
      "plot",
      "note",
      "instructions",
      "title",
      "body",
      "trigger",
      "other trigger",
      "stat",
      "stat detail",
      "item",
      "item detail",
    ]);
    const answers = Object.fromEntries(
      analyzeScenarioQuestions(content).questions.map(({ id }) => [
        id,
        `answer ${id}`,
      ]),
    );
    const result = resolveScenarioQuestions(content, answers);
    expect(result[0]).toMatchObject({
      id: "${ignored}",
      name: "answer item",
      description: "answer item detail",
    });
    expect(result[1]).toMatchObject({
      name: "answer stat",
      description: "answer stat detail",
      value: 3,
      range: [0, 5],
    });
    expect(result[3]).toMatchObject({
      title: "answer title",
      content: "answer body",
      triggers: ["answer trigger", "answer other trigger"],
      category: StorybookCategory.CHARACTER,
      isPinned: true,
    });
    expect(content[0]).toMatchObject({ name: "${item}" });
    expect(result).not.toBe(content);
    result.forEach((item, index) => expect(item).not.toBe(content[index]));
    if (result[1].type === "stat" && content[1].type === "stat")
      expect(result[1].range).not.toBe(content[1].range);
    if (result[3].type === "story_card" && content[3].type === "story_card")
      expect(result[3].triggers).not.toBe(content[3].triggers);
  });

  it("handles Unicode questions and prototype-like keys without inherited answers", () => {
    const content = [
      prompt("${ما اسمك؟} ${__proto__} ${constructor} ${toString}"),
    ];
    expect(() =>
      resolveScenarioQuestions(content, { "ما اسمك؟": "ليلى" }),
    ).toThrow("__proto__");
    const answers = Object.fromEntries([
      ["ما اسمك؟", "ليلى"],
      ["__proto__", "proto"],
      ["constructor", "ctor"],
      ["toString", "string"],
    ]);
    expect(resolveScenarioQuestions(content, answers)[0]).toMatchObject({
      content: "ليلى proto ctor string",
    });
  });

  it("decodes reserved delimiter escapes before matching repeated identities", () => {
    const content = [
      prompt(
        "\\${literal} ${Who\\| where\\}\\{\\$\\:\\\\? | choices: A\\, B, C\\|D}",
      ),
    ];
    const { questions, diagnostics } = analyzeScenarioQuestions(content);
    expect(diagnostics).toEqual([]);
    expect(questions).toEqual([
      {
        id: "Who| where}{$:\\?",
        question: "Who| where}{$:\\?",
        mode: "choices",
        options: ["A, B", "C|D"],
      },
    ]);
    expect(
      resolveScenarioQuestions(content, { [questions[0].id]: "A, B" })[0],
    ).toMatchObject({ content: "${literal} A, B" });
  });

  it("matches decoded question identities while keeping escaped commas in choices", () => {
    const content = [
      prompt("${Name\\|title} ${Name\\|title | choices: Count\\, Ada, Queen}"),
    ];
    expect(analyzeScenarioQuestions(content).questions).toEqual([
      {
        id: "Name|title",
        question: "Name|title",
        mode: "choices",
        options: ["Count, Ada", "Queen"],
      },
    ]);
    expect(
      resolveScenarioQuestions(content, { "Name|title": "Count, Ada" })[0],
    ).toMatchObject({ content: "Count, Ada Count, Ada" });
  });

  it("clones ordinary scenarios without changing text or adding optional fields", () => {
    const content: ScenarioContent[] = [
      prompt("  Rain falls.\nThe gate opens.  "),
      {
        type: "stat",
        version: 1,
        id: "nerve",
        name: "Nerve",
        value: 3,
        range: [0, 10],
      },
      { type: "inventory_item", version: 1, id: "key", name: "Key" },
    ];
    expect(analyzeScenarioQuestions(content)).toEqual({
      questions: [],
      diagnostics: [],
    });
    expect(resolveScenarioQuestions(content)).toEqual(content);
    expect(resolveScenarioQuestions(content)[0]).not.toBe(content[0]);
    expect(resolveScenarioQuestions(content)[1]).not.toHaveProperty(
      "description",
    );
  });

  it("preserves escaped literal placeholders, prose backslashes, and slash parity", () => {
    const text =
      "C:\\folder\\file \\${literal} \\\\${Name} \\\\\\${also literal}";
    expect(
      analyzeScenarioQuestions([prompt(text)]).questions.map(({ id }) => id),
    ).toEqual(["Name"]);
    expect(
      resolveScenarioQuestions([prompt(text)], { Name: "Ada" })[0],
    ).toMatchObject({
      content: "C:\\folder\\file ${literal} \\Ada \\${also literal}",
    });
    expect(previewScenarioText(text)).toBe(
      "C:\\folder\\file ${literal} \\Name \\${also literal}",
    );
  });

  it("substitutes answers literally once, without parsing answer syntax", () => {
    const answer = "${injected | choices: A, B} \\${other} $& $1";
    const content = [prompt("${Name} / ${Name} / ${Other}")];
    expect(
      resolveScenarioQuestions(content, { Name: answer, Other: "ok" })[0],
    ).toMatchObject({ content: `${answer} / ${answer} / ok` });
    expect(content[0]).toMatchObject({
      content: "${Name} / ${Name} / ${Other}",
    });
  });

  it.each([
    ["${}", "empty"],
    ["${  }", "empty"],
    ["${Name", "Unclosed"],
    ["${Name ${nested}}", "Nested"],
    ["${Name {nested}}", "Nested"],
    ["${Name | wrong: A}", "Unknown"],
    ["${Name | choices A}", "clause"],
    ["${Name | options:}", "empty"],
    ["${Name | choices:}", "empty"],
    ["${Name | choices: A, , B}", "empty"],
    ["${Name | choices: A,}", "empty"],
    ["${Name | choices: A, A}", "duplicate"],
    ["${Name | options: A,  A }", "duplicate"],
    ["${Name | options: A | choices: B}", "one options"],
    ["${Name\\n}", "Unsupported"],
  ])(
    "diagnoses malformed token %s without requiring answers",
    (text, message) => {
      const content = [prompt(text)];
      expect(analyzeScenarioQuestions(content).diagnostics).toEqual([
        {
          field: "Opening text",
          message: expect.stringContaining(message),
        },
      ]);
      expect(() => assertValidScenarioQuestions(content)).toThrow(message);
      expect(() => resolveScenarioQuestions(content)).toThrow(message);
    },
  );

  it.each([
    "${Name | choices: A, B} ${Name | choices: B, A}",
    "${Name | choices: A, B} ${Name | options: A, B}",
    "${Name | options: A, B} ${Name | options: A, C}",
  ])("rejects conflicting configurations for repeated questions", (text) => {
    expect(() => assertValidScenarioQuestions([prompt(text)])).toThrow(
      "conflicting",
    );
  });

  it("allows matching repeated definitions and validates all required answers", () => {
    const content = [
      prompt("${Name | choices: A, B} ${Name} ${Name | choices: A, B}"),
    ];
    expect(() => assertValidScenarioQuestions(content)).not.toThrow();
    const question = analyzeScenarioQuestions(content).questions[0];
    expect(getScenarioAnswerError(question, undefined)).toContain("Answer");
    expect(getScenarioAnswerError(question, " \n ")).toContain("Answer");
    expect(getScenarioAnswerError(question, "a")).toContain("listed");
    expect(getScenarioAnswerError(question, "C")).toContain("listed");
    expect(getScenarioAnswerError(question, " A ")).toBeNull();
    expect(() => resolveScenarioQuestions(content)).toThrow("Answer");
    expect(() => resolveScenarioQuestions(content, { Name: "C" })).toThrow(
      "listed",
    );
    expect(resolveScenarioQuestions(content, { Name: "B" })[0]).toMatchObject({
      content: "B B B",
    });
  });

  it("allows suggested options to receive custom text while requiring nonblank answers", () => {
    const question = analyzeScenarioQuestions([
      prompt("${Name | options: A, B}"),
    ]).questions[0];
    expect(getScenarioAnswerError(question, "Custom")).toBeNull();
    expect(getScenarioAnswerError(question, " ")).not.toBeNull();
  });

  it("shows question labels in previews and leaves malformed or escaped literals visible", () => {
    expect(
      previewScenarioText("Hello ${ Name | choices: A, B }, ${Place}."),
    ).toBe("Hello Name, Place.");
    expect(
      previewScenarioText("\\${literal | choices: A, B} ${bad | unknown: X}"),
    ).toBe("${literal | choices: A, B} ${bad | unknown: X}");
    expect(previewScenarioText("plain text")).toBe("plain text");
  });

  it("splits comma trigger lists outside complete or escaped placeholders only", () => {
    const text =
      " hero, ${Name | choices: A, B\\, C}, prefix ${Place}, \\${literal, example}, , ";
    expect(splitScenarioTriggers(text)).toEqual([
      "hero",
      "${Name | choices: A, B\\, C}",
      "prefix ${Place}",
      "\\${literal, example}",
    ]);
    expect(splitScenarioTriggers("first, ${Broken | choices: A, B")).toEqual([
      "first",
      "${Broken | choices: A, B",
    ]);
    expect(splitScenarioTriggers(" , \n, ")).toEqual([]);
  });

  it("reports errors from every supported field while ignoring metadata", () => {
    const content: ScenarioContent[] = [
      {
        type: "story_card",
        version: 1,
        id: "${}",
        title: "${}",
        content: "${}",
        triggers: ["fine", "${}"],
        category: StorybookCategory.PLACE,
        isPinned: false,
      },
      {
        type: "stat",
        version: 1,
        id: "${}",
        name: "${}",
        description: "${}",
        value: 1,
        range: [0, 3],
      },
      {
        type: "inventory_item",
        version: 1,
        id: "${}",
        name: "${}",
        description: "${}",
      },
    ];
    expect(
      analyzeScenarioQuestions(content).diagnostics.map(({ field }) => field),
    ).toEqual([
      "Story card 1: title",
      "Story card 1: content",
      "Story card 1: trigger 2",
      "Stat 1: name",
      "Stat 1: description",
      "Inventory item 1: name",
      "Inventory item 1: description",
    ]);
  });
});
