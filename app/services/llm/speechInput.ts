/** OpenAI's /audio/speech rejects input longer than this. */
export const MAX_SPEECH_INPUT_LENGTH = 4096;

const SPEECH_BREAKS = [
  /\S(?=\s*\n\s*\n)/g,
  /\S(?=\s*\n)/g,
  // Stops in scripts with spaces need one after them, so "3.5" stays whole.
  /[.!?…؟۔।]["'”’»)\]*_]*(?=\s)|[。！？][」』”’）*_]*/g,
  /\S(?=\s)/g,
];

export function splitSpeechInput(
  text: string,
  maxLength = MAX_SPEECH_INPUT_LENGTH,
): string[] {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > maxLength) {
    const end = findPartEnd(rest, maxLength);
    parts.push(rest.slice(0, end).trimEnd());
    rest = rest.slice(end).trimStart();
  }
  if (rest) parts.push(rest);
  return parts;
}

function findPartEnd(text: string, maxLength: number): number {
  for (const pattern of SPEECH_BREAKS) {
    let end = 0;
    for (const match of text.matchAll(pattern)) {
      const matchEnd = match.index + match[0].length;
      if (matchEnd > maxLength) break;
      end = matchEnd;
    }
    if (end > 0) return end;
  }

  // Cut at the limit without splitting a surrogate pair.
  const cut = Math.max(1, maxLength);
  const code = text.charCodeAt(cut - 1);
  return cut > 1 && code >= 0xd800 && code <= 0xdbff ? cut - 1 : cut;
}
