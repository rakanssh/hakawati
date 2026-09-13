import { renderToStaticMarkup } from "react-dom/server";
import { act, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { StoryText } from "./story-text";

function renderStory(text: string | ComponentProps<typeof StoryText>) {
  const container = document.createElement("div");
  const props = typeof text === "string" ? { text } : text;
  container.innerHTML = renderToStaticMarkup(<StoryText {...props} />);
  return container;
}

function segmentText(container: HTMLElement, id: string) {
  return [...container.querySelectorAll<HTMLElement>("[data-story-segment-id]")]
    .filter((span) => span.dataset.storySegmentId === id)
    .map((span) => span.textContent)
    .join("");
}

describe("StoryText", () => {
  it("renders emphasis across concatenated continuation boundaries", () => {
    const entries = ["The **door", " opens** and *a shadow", " waits*."];
    const container = renderStory(entries.join(""));

    expect(container.querySelector("strong")?.textContent).toBe("door opens");
    expect(container.querySelector("em")?.textContent).toBe("a shadow waits");
    expect(container.textContent).toBe("The door opens and a shadow waits.");
  });

  it("preserves soft line breaks, paragraphs, and explicit hard breaks", () => {
    const container = renderStory(
      "The first line.\nThe second line.\n\nA new paragraph.  \nAn explicit break.",
    );
    const paragraphs = container.querySelectorAll("p");

    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].textContent).toBe("The first line.\nThe second line.");
    expect(paragraphs[0].classList.contains("whitespace-pre-wrap")).toBe(true);
    expect(paragraphs[1].textContent).toContain("A new paragraph.");
    expect(paragraphs[1].querySelector("br")).not.toBeNull();
    expect(paragraphs[1].textContent).toContain("An explicit break.");
  });

  it("retains link labels while excluding interactive or embedded content", () => {
    const container = renderStory(
      [
        "[Read on](https://example.com) and [another path](javascript:alert(1)).",
        "![Illustration](https://example.com/image.png)",
        '<img src="https://example.com/raw.png" onerror="alert(1)">',
        '<script>alert("untrusted")</script>',
        '<iframe src="https://example.com"></iframe>',
      ].join("\n\n"),
    );

    expect(container.textContent).toContain("Read on and another path.");
    expect(container.querySelector("a, img, script, iframe")).toBeNull();
    expect(container.querySelector("[href], [src], [onerror]")).toBeNull();
  });

  it("keeps unsupported block formatting as ordinary text", () => {
    const container = renderStory("# A quiet room\n\n> A whispered *warning*.");

    expect(container.querySelector("h1, blockquote")).toBeNull();
    expect(container.textContent).toContain("A quiet room");
    expect(container.textContent).toContain("A whispered warning.");
    expect(container.querySelector("em")?.textContent).toBe("warning");
  });

  it("highlights only the continuation while formatting spans source boundaries", () => {
    const container = renderStory({
      segments: [
        { id: "old", text: "The **door" },
        { id: "new", text: " opens** and *a shadow waits*." },
      ],
      highlightedSegmentId: "new",
    });

    expect(container.querySelector("strong")?.textContent).toBe("door opens");
    expect(segmentText(container, "old")).toBe("The door");
    expect(segmentText(container, "new")).toBe(" opens and a shadow waits.");
    const spans = container.querySelectorAll<HTMLElement>(
      "[data-story-segment-id]",
    );
    for (const span of spans) {
      expect(span.classList.contains("bg-primary/10")).toBe(
        span.dataset.storySegmentId === "new",
      );
    }
  });

  it("maps adjacent mid-word entries and split Markdown delimiters", () => {
    const container = renderStory({
      segments: [
        { id: "first", text: "A water" },
        { id: "second", text: "fall *" },
        { id: "third", text: "*cascades*" },
        { id: "fourth", text: "* nearby." },
      ],
    });

    expect(container.textContent).toBe("A waterfall cascades nearby.");
    expect(container.querySelector("strong")?.textContent).toBe("cascades");
    expect(segmentText(container, "first")).toBe("A water");
    expect(segmentText(container, "second")).toBe("fall ");
    expect(segmentText(container, "third")).toBe("cascades");
    expect(segmentText(container, "fourth")).toBe(" nearby.");
  });

  it("keeps source ownership after paragraph whitespace and empty entries", () => {
    const container = renderStory({
      segments: [
        { id: "old", text: "  First paragraph.\n\nOlder end" },
        { id: "empty", text: "" },
        { id: "new", text: " plus newer.\nNext line.  " },
      ],
    });

    expect(container.querySelectorAll("p")).toHaveLength(2);
    expect(segmentText(container, "old")).toBe("First paragraph.Older end");
    expect(segmentText(container, "new")).toBe(" plus newer.\nNext line.");
    expect(segmentText(container, "empty")).toBe("");
  });

  it("maps escaped punctuation, decoded entities, and unwrapped link labels", () => {
    const container = renderStory({
      segments: [
        { id: "old", text: "\\* &amp; &#65; [old" },
        { id: "new", text: " and new](https://example.com) next" },
      ],
    });

    expect(segmentText(container, "old")).toBe("* & A old");
    expect(segmentText(container, "new")).toBe(" and new next");
    expect(container.querySelector("a")).toBeNull();
  });

  it("assigns a split character reference to the entry where it starts", () => {
    const container = renderStory({
      segments: [
        { id: "old", text: "&am" },
        { id: "new", text: "p; next" },
      ],
    });

    expect(segmentText(container, "old")).toBe("&");
    expect(segmentText(container, "new")).toBe(" next");
  });

  it("routes clicks and keyboard editing to each source entry", () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onEditSegment = vi.fn();
    try {
      act(() =>
        root.render(
          <StoryText
            segments={[
              { id: "old", text: "Older **paragraph.**\n\nOlder ending" },
              { id: "new", text: " and *newer prose*." },
            ]}
            onEditSegment={onEditSegment}
          />,
        ),
      );
      const newest = container.querySelector<HTMLElement>(
        '[data-story-segment-id="new"]',
      )!;
      const old = container.querySelector<HTMLElement>(
        '[data-story-segment-id="old"]',
      )!;
      act(() => newest.click());
      expect(onEditSegment).toHaveBeenLastCalledWith("new");
      act(() =>
        old.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        ),
      );
      expect(onEditSegment).toHaveBeenLastCalledWith("old");
      expect(container.querySelectorAll('[tabindex="0"]')).toHaveLength(2);
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });

  it("does not offer editing without a handler or activate raw HTML in segments", () => {
    const container = renderStory({
      segments: [
        {
          id: "entry",
          text: '<span data-story-segment-id="spoof">Words</span>\n\n<script>alert(1)</script>\n\n![image](https://example.com/image.png)',
        },
      ],
    });

    expect(segmentText(container, "entry")).toBe("Words");
    expect(
      container.querySelector('[data-story-segment-id="spoof"]'),
    ).toBeNull();
    expect(
      container.querySelector("script, img, [role=button], [tabindex]"),
    ).toBeNull();
  });

  it("edits single-entry paragraph whitespace without rerouting mixed text clicks", () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    const root = createRoot(container);
    const onEditSegment = vi.fn();
    try {
      act(() =>
        root.render(
          <StoryText
            segments={[
              {
                id: "old",
                text: "Older first line.\n**Older second line.**\n\nOlder mixed",
              },
              { id: "new", text: " and new.\n\nNew paragraph." },
            ]}
            onEditSegment={onEditSegment}
          />,
        ),
      );
      const paragraphs = container.querySelectorAll("p");
      act(() => paragraphs[0].click());
      expect(onEditSegment.mock.calls).toEqual([["old"]]);

      act(() => paragraphs[0].querySelector<HTMLElement>("span")!.click());
      expect(onEditSegment.mock.calls).toEqual([["old"], ["old"]]);

      act(() => paragraphs[1].click());
      expect(onEditSegment).toHaveBeenCalledTimes(2);
      act(() =>
        paragraphs[1]
          .querySelector<HTMLElement>('[data-story-segment-id="new"]')!
          .click(),
      );
      expect(onEditSegment).toHaveBeenLastCalledWith("new");
      expect(onEditSegment).toHaveBeenCalledTimes(3);

      act(() => paragraphs[2].click());
      expect(onEditSegment).toHaveBeenLastCalledWith("new");
      expect(onEditSegment).toHaveBeenCalledTimes(4);
      expect(container.querySelectorAll('[tabindex="0"]')).toHaveLength(2);
    } finally {
      act(() => root.unmount());
    }
  });
});
