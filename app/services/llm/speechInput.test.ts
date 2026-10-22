import { describe, expect, it } from "vitest";
import { MAX_SPEECH_INPUT_LENGTH, splitSpeechInput } from "./speechInput";

describe("splitSpeechInput", () => {
  it("keeps text that fits in one part", () => {
    const longest = "a".repeat(MAX_SPEECH_INPUT_LENGTH);

    expect(splitSpeechInput("  The door opens.  ")).toEqual([
      "The door opens.",
    ]);
    expect(splitSpeechInput(longest)).toEqual([longest]);
    expect(splitSpeechInput(" \n ")).toEqual([]);
  });

  it("splits at paragraph breaks before line or sentence breaks", () => {
    expect(
      splitSpeechInput("One. Two.\n\nThree. Four.\nFive. Six.", 26),
    ).toEqual(["One. Two.", "Three. Four.\nFive. Six."]);
    expect(splitSpeechInput("Alpha.\n\nBeta.\n\nGamma.", 15)).toEqual([
      "Alpha.\n\nBeta.",
      "Gamma.",
    ]);
  });

  it("falls back to line, sentence and word breaks inside a paragraph", () => {
    expect(splitSpeechInput("Up the stairs.\nThe door. A key.", 24)).toEqual([
      "Up the stairs.",
      "The door. A key.",
    ]);
    expect(splitSpeechInput("One. Two. Three.", 10)).toEqual([
      "One. Two.",
      "Three.",
    ]);
    expect(splitSpeechInput("one two three four", 9)).toEqual([
      "one two",
      "three",
      "four",
    ]);
  });

  it("finds sentence ends after quotes and in other scripts, but not in numbers", () => {
    expect(splitSpeechInput('"Run!" she said. *He ran.* Then', 26)).toEqual([
      '"Run!" she said. *He ran.*',
      "Then",
    ]);
    expect(splitSpeechInput("It costs 3.50 coins. Pay now.", 15)).toEqual([
      "It costs 3.50",
      "coins. Pay now.",
    ]);
    expect(splitSpeechInput("门开了。风很冷。她走了。", 8)).toEqual([
      "门开了。风很冷。",
      "她走了。",
    ]);
    expect(splitSpeechInput("هل أنت هنا؟ نعم أنا هنا.", 14)).toEqual([
      "هل أنت هنا؟",
      "نعم أنا هنا.",
    ]);
  });

  it("cuts text without breaks at the limit, keeping surrogate pairs whole", () => {
    expect(splitSpeechInput("abcdef", 4)).toEqual(["abcd", "ef"]);
    expect(splitSpeechInput("abc😀def", 4)).toEqual(["abc", "😀de", "f"]);
  });

  it("keeps every part of a long passage within the speech input limit", () => {
    const sentence = "The lantern swings as the caravan climbs the pass. ";
    const opening = sentence.repeat(20).trim();
    const longParagraph = sentence.repeat(100).trim();
    const closing = sentence.repeat(50).trim();
    const text = [opening, longParagraph, closing].join("\n\n");

    const parts = splitSpeechInput(text);

    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0]).toBe(opening);
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(MAX_SPEECH_INPUT_LENGTH);
      expect(part.endsWith("pass.")).toBe(true);
    }
    expect(parts.join(" ").replace(/\s+/g, " ")).toBe(
      text.replace(/\s+/g, " "),
    );
  });
});
