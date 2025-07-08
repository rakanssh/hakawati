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
