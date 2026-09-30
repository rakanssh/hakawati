import { beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({ invoke: vi.fn(), isTauri: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: native.invoke,
  isTauri: native.isTauri,
  Channel: class {
    onmessage?: (event: unknown) => void;
  },
}));

import {
  fetchChatGpt,
  getChatGptSession,
  signInWithChatGpt,
  signOutOfChatGpt,
  subscribeChatGptSession,
} from "./chatgpt";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

type NativeRequest = {
  id: string;
  path: string;
  body: string | null;
  onEvent: { onmessage(event: unknown): void };
};

describe("ChatGPT native service", () => {
  beforeEach(() => {
    native.invoke.mockReset();
    native.isTauri.mockReturnValue(true);
  });

  it("reports browser unavailability without touching native credentials", async () => {
    native.isTauri.mockReturnValue(false);
    expect(await getChatGptSession()).toMatchObject({
      available: false,
      connected: false,
    });
    await expect(signInWithChatGpt()).rejects.toThrow("desktop app");
    await expect(fetchChatGpt("/models")).rejects.toThrow("desktop app");
    expect(native.invoke).not.toHaveBeenCalled();
  });

  it("streams bytes and preserves HTTP errors without exposing authentication", async () => {
    const done = deferred<void>();
    let request!: NativeRequest;
    native.invoke.mockImplementation((command: string, args: NativeRequest) => {
      if (command === "chatgpt_start_operation")
        return Promise.resolve("request-id");
      request = args;
      return done.promise;
    });
    const pending = fetchChatGpt("/responses", {
      method: "POST",
      body: '{"stream":true,"store":false}',
      headers: { Authorization: "ignored" },
    });
    await vi.waitFor(() => expect(request).toBeDefined());
    request.onEvent.onmessage({
      type: "headers",
      status: 429,
      headers: {
        "x-request-id": "req_123",
        "content-type": "application/json",
      },
    });
    const response = await pending;
    expect(response.status).toBe(429);
    expect(response.headers.get("x-request-id")).toBe("req_123");
    expect(request).not.toHaveProperty("headers");
    const text = response.text();
    const data = new TextEncoder().encode('{"detail":"limit وصلت"}');
    request.onEvent.onmessage({
      type: "chunk",
      data: Array.from(data.slice(0, 20)),
    });
    request.onEvent.onmessage({
      type: "chunk",
      data: Array.from(data.slice(20)),
    });
    request.onEvent.onmessage({ type: "end" });
    done.resolve();
    expect(await text).toBe('{"detail":"limit وصلت"}');
  });

  it("cancels a stream after headers and errors the reader", async () => {
    const done = deferred<void>();
    let request!: NativeRequest;
    native.invoke.mockImplementation((command: string, args: NativeRequest) => {
      if (command === "chatgpt_start_operation")
        return Promise.resolve("stream-id");
      if (command === "chatgpt_cancel_operation") return Promise.resolve();
      request = args;
      return done.promise;
    });
    const controller = new AbortController();
    const pending = fetchChatGpt("/models", { signal: controller.signal });
    await vi.waitFor(() => expect(request).toBeDefined());
    request.onEvent.onmessage({ type: "headers", status: 200, headers: {} });
    const reader = (await pending).body!.getReader();
    const read = reader.read();
    controller.abort();
    await expect(read).rejects.toMatchObject({ name: "AbortError" });
    expect(native.invoke).toHaveBeenCalledWith("chatgpt_cancel_operation", {
      id: "stream-id",
    });
    done.reject("cancelled");
    request.onEvent.onmessage({ type: "chunk", data: [1] }); // late native events are ignored
  });

  it("cancels if aborted while the operation ID is being allocated", async () => {
    const allocation = deferred<string>();
    native.invoke.mockImplementation((command: string) => {
      if (command === "chatgpt_start_operation") return allocation.promise;
      if (command === "chatgpt_request") return Promise.reject("cancelled");
      return Promise.resolve();
    });
    const controller = new AbortController();
    const pending = fetchChatGpt("/models", { signal: controller.signal });
    controller.abort();
    allocation.resolve("pending-id");
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(native.invoke).toHaveBeenCalledWith("chatgpt_cancel_operation", {
      id: "pending-id",
    });
  });

  it("propagates reader cancellation to the native request", async () => {
    const done = deferred<void>();
    let request!: NativeRequest;
    native.invoke.mockImplementation((command: string, args: NativeRequest) => {
      if (command === "chatgpt_start_operation")
        return Promise.resolve("reader-id");
      if (command === "chatgpt_cancel_operation") return Promise.resolve();
      request = args;
      return done.promise;
    });
    const pending = fetchChatGpt("/models");
    await vi.waitFor(() => expect(request).toBeDefined());
    request.onEvent.onmessage({ type: "headers", status: 200, headers: {} });
    await (await pending).body!.cancel();
    expect(native.invoke).toHaveBeenCalledWith("chatgpt_cancel_operation", {
      id: "reader-id",
    });
    done.reject("cancelled");
  });

  it("waits for delayed Tauri channel data after the invoke promise resolves", async () => {
    let request!: NativeRequest;
    const done = deferred<void>();
    native.invoke.mockImplementation((command: string, args: NativeRequest) => {
      if (command === "chatgpt_start_operation")
        return Promise.resolve("request-id");
      request = args;
      return done.promise;
    });
    const pending = fetchChatGpt("/models");
    await vi.waitFor(() => expect(request).toBeDefined());
    request.onEvent.onmessage({ type: "headers", status: 200, headers: {} });
    const text = (await pending).text();
    done.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    request.onEvent.onmessage({
      type: "chunk",
      data: Array.from(new TextEncoder().encode("delayed large payload")),
    });
    request.onEvent.onmessage({ type: "end" });
    await expect(text).resolves.toBe("delayed large payload");
  });

  it("errors a truncated native response stream", async () => {
    const done = deferred<void>();
    let request!: NativeRequest;
    native.invoke.mockImplementation((command: string, args: NativeRequest) => {
      if (command === "chatgpt_start_operation")
        return Promise.resolve("request-id");
      request = args;
      return done.promise;
    });
    const pending = fetchChatGpt("/models");
    await vi.waitFor(() => expect(request).toBeDefined());
    request.onEvent.onmessage({ type: "headers", status: 200, headers: {} });
    const text = (await pending).text();
    done.reject("ChatGPT response stream was interrupted");
    await expect(text).rejects.toThrow("stream was interrupted");
  });

  it("keeps cancellation and registration metadata native during sign-in", async () => {
    const done = deferred<unknown>();
    native.invoke.mockImplementation((command: string) => {
      if (command === "chatgpt_start_operation")
        return Promise.resolve("auth-id");
      if (command === "chatgpt_sign_in") return done.promise;
      return Promise.resolve();
    });
    const changed = vi.fn();
    const unsubscribe = subscribeChatGptSession(changed);
    const controller = new AbortController();
    const pending = signInWithChatGpt({
      signal: controller.signal,
    });
    await vi.waitFor(() =>
      expect(native.invoke).toHaveBeenCalledWith("chatgpt_sign_in", {
        id: "auth-id",
      }),
    );
    controller.abort();
    done.reject("Sign-in cancelled");
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(changed).toHaveBeenCalledOnce();
    expect(native.invoke).toHaveBeenCalledWith("chatgpt_cancel_operation", {
      id: "auth-id",
    });
    unsubscribe();
  });

  it("publishes session changes and preserves remote revocation warnings", async () => {
    const changed = vi.fn();
    const unsubscribe = subscribeChatGptSession(changed);
    native.invoke.mockResolvedValueOnce({ remoteRevocationConfirmed: false });
    expect(await signOutOfChatGpt()).toEqual({
      remoteRevocationConfirmed: false,
    });
    expect(changed).toHaveBeenCalledOnce();
    unsubscribe();
  });
});
