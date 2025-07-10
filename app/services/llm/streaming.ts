export async function* parseOpenAIStream(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let done: boolean, value: Uint8Array | undefined;
  while ((({ done, value } = await reader.read()), !done)) {
    const chunk = decoder.decode(value);
    for (const line of chunk.split("\n")) {
      if (line.startsWith("data: ")) {
        const payload = line.replace("data: ", "");
        if (payload === "[DONE]") return;
        const json = JSON.parse(payload);
        const token = json.choices[0].delta?.content;
        if (token) yield token;
      }
    }
  }
}

export async function* parseJsonStream<T>(
  iterator: AsyncIterable<string>
): AsyncGenerator<Partial<T>> {
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
      }
    }
  }
}
