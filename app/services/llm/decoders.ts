import { LLMAction } from "./schema";
import { GameMode } from "@/types";

export interface DecodedResponse {
  story?: string;
  actions?: LLMAction[];
  actionParseError?: boolean;
}

export interface OutputDecoder {
  decode(
    iterator: AsyncIterable<string>,
  ): AsyncGenerator<Partial<DecodedResponse>>;
}

function decodeEscapeAtShared(
  src: string,
  i: number,
): { char?: string; advance?: number; incomplete?: boolean } {
  if (i + 1 >= src.length) return { incomplete: true };
  const code = src[i + 1];
  switch (code) {
    case '"':
    case "'":
    case "\\":
      return { char: code, advance: 2 };
    case "n":
      return { char: "\n", advance: 2 };
    case "r":
      return { char: "\r", advance: 2 };
    case "t":
      return { char: "\t", advance: 2 };
    case "b":
      return { char: "\b", advance: 2 };
    case "f":
      return { char: "\f", advance: 2 };
    case "v":
      return { char: "\v", advance: 2 };
    case "0":
      return { char: "\0", advance: 2 };
    case "x": {
      // \xNN (2 hex)
      if (i + 3 >= src.length) return { incomplete: true };
      const h = src.substring(i + 2, i + 4);
      const cp = Number.parseInt(h, 16);
      if (Number.isNaN(cp))
        return { char: src.substring(i, i + 4), advance: 4 };
      return { char: String.fromCharCode(cp), advance: 4 };
    }
    case "u": {
      // \uNNNN (4 hex), possibly surrogate pair
      if (i + 5 >= src.length) return { incomplete: true };
      const h = src.substring(i + 2, i + 6);
      const unit = Number.parseInt(h, 16);
      if (Number.isNaN(unit))
        return { char: src.substring(i, i + 6), advance: 6 };

      // If high surrogate, try to read following low surrogate as a pair
      const isHigh = unit >= 0xd800 && unit <= 0xdbff;
      if (isHigh) {
        // Need another \uNNNN following
        if (i + 12 <= src.length && src[i + 6] === "\\" && src[i + 7] === "u") {
          const h2 = src.substring(i + 8, i + 12);
          const unit2 = Number.parseInt(h2, 16);
          if (!Number.isNaN(unit2) && unit2 >= 0xdc00 && unit2 <= 0xdfff) {
            const cp = (unit - 0xd800) * 0x400 + (unit2 - 0xdc00) + 0x10000;
            return { char: String.fromCodePoint(cp), advance: 12 };
          }
        }
        // pair incomplete; wait for more data
        return { incomplete: true };
      }
      return { char: String.fromCharCode(unit), advance: 6 };
    }
    default:
      // Unknown escape; pass through as-is
      return { char: src.substring(i, i + 2), advance: 2 };
  }
}

/**
 * JSON Decoder for GM Mode
 * Expects structured JSON response with {story, actions} format
 * Streams story content and extracts actions at the end
 */
export class JsonDecoder implements OutputDecoder {
  async *decode(
    iterator: AsyncIterable<string>,
  ): AsyncGenerator<Partial<DecodedResponse>> {
    let buffer = "";
    let decodedStoryBuffer = "";
    let inStory = false;
    let storyParsingDone = false;
    let lastYieldedStoryLength = 0;

    function decodeEscapeAt(
      src: string,
      i: number,
    ): { char?: string; advance?: number; incomplete?: boolean } {
      return decodeEscapeAtShared(src, i);
    }

    for await (const chunk of iterator) {
      buffer += chunk;

      if (storyParsingDone) continue;

      if (!inStory) {
        const storyStartIndex = buffer.indexOf('"story": "');
        if (storyStartIndex !== -1) {
          inStory = true;
        }
      }

      if (inStory) {
        const storyContentStartIndex = buffer.indexOf('"story": "') + 10;
        let i = storyContentStartIndex;
        decodedStoryBuffer = "";
        while (i < buffer.length) {
          const ch = buffer[i];
          if (ch === "\\") {
            const res = decodeEscapeAt(buffer, i);
            if (res.incomplete) break; // wait for more data
            decodedStoryBuffer += res.char ?? "";
            i += res.advance ?? 2;
            continue;
          }
          if (ch === '"') {
            storyParsingDone = true;
            break;
          }
          decodedStoryBuffer += ch;
          i++;
        }

        if (decodedStoryBuffer.length > lastYieldedStoryLength) {
          const newStoryChunk = decodedStoryBuffer.substring(
            lastYieldedStoryLength,
          );
          yield { story: newStoryChunk };
          lastYieldedStoryLength = decodedStoryBuffer.length;
        }
      }
    }

    try {
      const fullJson = JSON.parse(buffer);
      if (fullJson.actions) {
        yield { actions: fullJson.actions };
      }
    } catch (e) {
      console.warn("Could not parse final JSON:", buffer, e);
      const startIndex = buffer.indexOf("{");
      const endIndex = buffer.lastIndexOf("}");
      if (startIndex !== -1 && endIndex !== -1) {
        const jsonString = buffer.substring(startIndex, endIndex + 1);
        try {
          const finalJson = JSON.parse(jsonString);
          if (finalJson.actions) {
            yield { actions: finalJson.actions };
          }
        } catch (e2) {
          console.warn(
            "Could not parse extracted JSON object:",
            jsonString,
            e2,
          );
          yield { actionParseError: true };
        }
      } else {
        yield { actionParseError: true };
      }
    }
  }
}

/**
 * Plain Text Decoder for Story Mode
 * Treats all incoming text as story content
 */
export class PlainTextDecoder implements OutputDecoder {
  async *decode(
    iterator: AsyncIterable<string>,
  ): AsyncGenerator<Partial<DecodedResponse>> {
    let carry = "";
    for await (const chunk of iterator) {
      const input = carry + (chunk ?? "");
      let i = 0;
      let out = "";
      while (i < input.length) {
        const ch = input[i];
        if (ch === "\\") {
          const res = decodeEscapeAtShared(input, i);
          if (res.incomplete) break; // keep incomplete sequence in carry
          out += res.char ?? "";
          i += res.advance ?? 2;
        } else {
          out += ch;
          i++;
        }
      }
      if (out) {
        yield { story: out };
      }
      carry = input.substring(i);
    }
    if (carry) {
      let i = 0;
      let out = "";
      while (i < carry.length) {
        const ch = carry[i];
        if (ch === "\\") {
          const res = decodeEscapeAtShared(carry, i);
          if (res.incomplete) {
            out += "\\";
            i += 1;
          } else {
            out += res.char ?? "";
            i += res.advance ?? 2;
          }
        } else {
          out += ch;
          i++;
        }
      }
      if (out) {
        yield { story: out };
      }
    }
  }
}

/**
 * Factory function to get appropriate decoder based on game mode
 * @param gameMode - The game mode to create a decoder for
 * @returns The appropriate decoder for the given game mode
 */
export function createDecoder(gameMode: GameMode): OutputDecoder {
  switch (gameMode) {
    case GameMode.GM:
      return new JsonDecoder();
    case GameMode.STORY_TELLER:
      return new PlainTextDecoder();
    default:
      console.warn(`Unknown game mode: ${gameMode}, defaulting to GM mode`);
      return new JsonDecoder();
  }
}
