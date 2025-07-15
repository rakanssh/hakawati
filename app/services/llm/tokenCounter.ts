import { get_encoding, Tiktoken } from "tiktoken";
import { ChatMessage } from "./schema";

// To-do: Add support for more models
const ENCODING = "cl100k_base";

let tokenizer: Tiktoken | null = null;
function getTokenizer() {
  tokenizer ??= get_encoding(ENCODING);
  return tokenizer;
}

export function countTokens(text: string): number {
  if (!text || text.length === 0) {
    return 0;
  }
  const tokenizer = getTokenizer();
  return tokenizer.encode(text).length;
}

export function countMessageTokens(messages: ChatMessage[]): number {
  let tokenCount = 0;
  for (const message of messages) {
    tokenCount += countTokens(message.content);
    tokenCount += countTokens(message.role);
  }
  return tokenCount;
}
