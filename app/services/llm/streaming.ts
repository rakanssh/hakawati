export async function* parseOpenAIStream(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") return;
      try {
        const json = JSON.parse(payload);
        const token = json?.choices?.[0]?.delta?.content;
        if (token) yield token as string;
      } catch {
        // ignore malformed partials; remaining bytes will arrive in subsequent chunks
      }
    }
  }

  // Flush any remaining buffered single line
  if (buffer.startsWith("data: ")) {
    const payload = buffer.slice(6).trim();
    if (payload !== "[DONE]") {
      try {
        const json = JSON.parse(payload);
        const token = json?.choices?.[0]?.delta?.content;
        if (token) yield token as string;
      } catch {
        // ignore
      }
    }
  }
}

export async function* parseJsonStream<T>(
  iterator: AsyncIterable<string>
): AsyncGenerator<Partial<T> | { actionParseError: boolean }> {
  let buffer = "";
  let storyBuffer = "";
  let inStory = false;
  let storyParsingDone = false;
  let lastYieldedStoryLength = 0;

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
      storyBuffer = "";
      while (i < buffer.length) {
        if (buffer[i] === "\\" && i + 1 < buffer.length) {
          storyBuffer += buffer.substring(i, i + 2);
          i += 2;
        } else if (buffer[i] === '"') {
          storyParsingDone = true;
          break;
        } else {
          storyBuffer += buffer[i];
          i++;
        }
      }

      if (storyBuffer.length > lastYieldedStoryLength) {
        const newStoryChunk = storyBuffer.substring(lastYieldedStoryLength);
        yield { story: newStoryChunk } as unknown as Partial<T>;
        lastYieldedStoryLength = storyBuffer.length;
      }
    }
  }

  try {
    const fullJson = JSON.parse(buffer);
    if (fullJson.actions) {
      yield { actions: fullJson.actions } as unknown as Partial<T>;
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
          yield { actions: finalJson.actions } as unknown as Partial<T>;
        }
      } catch (e2) {
        console.warn("Could not parse extracted JSON object:", jsonString, e2);
        yield { actionParseError: true };
      }
    } else {
      yield { actionParseError: true };
    }
  }
}
