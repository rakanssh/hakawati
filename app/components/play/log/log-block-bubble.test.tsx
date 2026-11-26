import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { act, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LogEntryRole, type LogEntry } from "@/types/log.type";
import { useSettingsStore } from "@/store";
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

function renderBlock(
  entries: LogEntry[],
  props: Partial<Parameters<typeof LogBlockBubble>[0]> = {},
) {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(
    <LogBlockBubble
      block={{ role: LogEntryRole.GM, chainId: "chain-1", entries }}
      {...props}
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

  it("says when a stat or item change failed", () => {
    const container = renderBlock([
      gm({ id: "gm-1", text: "A trap springs.", isActionError: true }),
      gm({ id: "gm-2", text: " You run." }),
    ]);

    expect(container.querySelector("[data-log-error]")?.textContent).toBe(
      "A stat or item change failed",
    );
  });

  describe("recap button", () => {
    const onRecapCommit = () => undefined;
    const recapped = [
      gm({ id: "gm-1", text: "Mara strikes.", recap: ["Mara hit Tobin."] }),
      gm({ id: "gm-2", text: " Tobin falls." }),
    ];
    const button = (container: HTMLElement) =>
      container.querySelector<HTMLButtonElement>("[data-log-recap]");

    afterEach(() => {
      useSettingsStore.setState({ storyRecaps: true });
    });

    it("shows on a passage that has a recap", () => {
      const container = renderBlock(recapped, { onRecapCommit });

      expect(button(container)?.getAttribute("aria-label")).toBe("Recap");
      expect(button(container)?.classList.contains("opacity-50")).toBe(false);
    });

    it("dims when nothing in the block was kept", () => {
      const container = renderBlock(
        [gm({ id: "gm-1", text: "Rain.", recap: [] })],
        {
          onRecapCommit,
        },
      );

      expect(button(container)?.classList.contains("opacity-50")).toBe(true);
    });

    it("hides without recaps, while editing, or while streaming", () => {
      expect(
        button(
          renderBlock([gm({ id: "gm-1", text: "Rain." })], { onRecapCommit }),
        ),
      ).toBeNull();
      expect(
        button(
          renderBlock(recapped, { onRecapCommit, editingEntryId: "gm-2" }),
        ),
      ).toBeNull();
      expect(
        button(renderBlock(recapped, { onRecapCommit, isStreaming: true })),
      ).toBeNull();
    });

    it("hides when story recaps are turned off", () => {
      (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
      ).IS_REACT_ACT_ENVIRONMENT = true;
      const container = document.createElement("div");
      const root = createRoot(container);
      const render = () =>
        act(() =>
          root.render(
            <LogBlockBubble
              block={{
                role: LogEntryRole.GM,
                chainId: "chain-1",
                entries: recapped,
              }}
              onRecapCommit={onRecapCommit}
            />,
          ),
        );

      render();
      expect(button(container)).not.toBeNull();
      act(() => useSettingsStore.setState({ storyRecaps: false }));
      expect(button(container)).toBeNull();
      act(() => root.unmount());
    });
  });
});
