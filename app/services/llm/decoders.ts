import { StreamChunk } from "./schema";
import { GameMode, LLMAction } from "@/types";
import { convertToolCallsToActions } from "./tools";
import { ToolCallAccumulator } from "./tool-call-accumulator";

export interface DecodedResponse {
  story?: string;
  thinking?: string;
  actions?: LLMAction[];
  actionParseError?: boolean;
}

export interface OutputDecoder {
  decode(
    iterator: AsyncIterable<StreamChunk>,
  ): AsyncGenerator<Partial<DecodedResponse>>;
}

export function decodeJsonEscape(
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

export class ToolCallingDecoder implements OutputDecoder {
  async *decode(
    iterator: AsyncIterable<StreamChunk>,
  ): AsyncGenerator<Partial<DecodedResponse>> {
    const accumulator = new ToolCallAccumulator();

    for await (const chunk of iterator) {
      if (chunk.content) {
        yield { story: chunk.content };
      }
      if (chunk.thinking) {
        yield { thinking: chunk.thinking };
      }
      accumulator.add(chunk.tool_calls);
    }

    if (accumulator.size > 0) {
      const { calls, incomplete } = accumulator.result();
      const { actions, failed } = convertToolCallsToActions(calls);
      if (actions.length > 0) yield { actions };
      if (incomplete.length > 0 || failed.length > 0) {
        console.warn("Unreadable tool calls:", [...incomplete, ...failed]);
        yield { actionParseError: true };
      }
    }
  }
}

/**
 * Plain Text Decoder for Story Teller Mode
 * Extracts content from chunks and decodes escape sequences
 */
export class PlainTextDecoder implements OutputDecoder {
  private decodeEscapedChunk(
    carry: string,
    text: string,
  ): { output: string; nextCarry: string } {
    const input = carry + text;
    let i = 0;
    let out = "";
    while (i < input.length) {
      const ch = input[i];
      if (ch === "\\") {
        const res = decodeJsonEscape(input, i);
        if (res.incomplete) break; // keep incomplete sequence in carry
        out += res.char ?? "";
        i += res.advance ?? 2;
      } else {
        out += ch;
        i++;
      }
    }
    return { output: out, nextCarry: input.substring(i) };
  }

  private flushCarry(carry: string): string {
    if (!carry) return "";
    let i = 0;
    let out = "";
    while (i < carry.length) {
      const ch = carry[i];
      if (ch === "\\") {
        const res = decodeJsonEscape(carry, i);
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
    return out;
  }

  async *decode(
    iterator: AsyncIterable<StreamChunk>,
  ): AsyncGenerator<Partial<DecodedResponse>> {
    let storyCarry = "";
    let thinkingCarry = "";

    for await (const chunk of iterator) {
      if (chunk.content) {
        const decoded = this.decodeEscapedChunk(storyCarry, chunk.content);
        storyCarry = decoded.nextCarry;
        if (decoded.output) {
          yield { story: decoded.output };
        }
      }

      if (chunk.thinking) {
        const decoded = this.decodeEscapedChunk(thinkingCarry, chunk.thinking);
        thinkingCarry = decoded.nextCarry;
        if (decoded.output) {
          yield { thinking: decoded.output };
        }
      }
    }

    const flushedStory = this.flushCarry(storyCarry);
    if (flushedStory) {
      yield { story: flushedStory };
    }

    const flushedThinking = this.flushCarry(thinkingCarry);
    if (flushedThinking) {
      yield { thinking: flushedThinking };
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
      return new ToolCallingDecoder();
    case GameMode.STORY_TELLER:
      return new PlainTextDecoder();
    default:
      console.warn(`Unknown game mode: ${gameMode}, defaulting to GM mode`);
      return new ToolCallingDecoder();
  }
}
