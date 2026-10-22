import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { LogEntryRole, type LogEntry } from "@/types/log.type";
import { LogBlockBubble } from "./log-block-bubble";

vi.mock("@lingui/core/macro", () => ({
  msg: (value: TemplateStringsArray | string) =>
    typeof value === "string" ? value : value.join(""),
}));

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => children,
  useLingui: () => ({
    t: (parts: TemplateStringsArray) => parts.join(""),
  }),
}));

function renderBlock(entries: LogEntry[]) {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(
    <LogBlockBubble
      block={{ role: LogEntryRole.GM, chainId: "chain-1", entries }}
    />,
  );
  return container;
}

const gm = (entry: Partial<LogEntry> & { id: string }): LogEntry => ({
  role: LogEntryRole.GM,
  text: "",
  chainId: "chain-1",
  ...entry,
});

describe("LogBlockBubble", () => {
  it("shows why a reply failed beside the story, where touch screens can read it", () => {
    const container = renderBlock([
      gm({
        id: "gm-1",
        text: "The door creaks",
        error: "The connection ended before the response finished.",
      }),
    ]);

    expect(container.querySelector("[data-log-error]")?.textContent).toBe(
      "The connection ended before the response finished.",
    );
    expect(container.querySelector("[data-log-story]")?.textContent).toBe(
      "The door creaks",
    );
  });

  it("names the failure when an older save kept no reason", () => {
    const container = renderBlock([gm({ id: "gm-1", error: {} })]);

    expect(container.querySelector("[data-log-error]")?.textContent).toBe(
      "Request failed",
    );
  });

  it("drops the reason once the story continues past the failed reply", () => {
    const container = renderBlock([
      gm({ id: "gm-1", text: "The door", error: "Request failed (502)" }),
      gm({ id: "gm-2", text: " opens." }),
    ]);

    expect(container.querySelector("[data-log-error]")).toBeNull();
  });
});
