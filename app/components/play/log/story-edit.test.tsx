import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { StoryText } from "./story-text";
import { serializeSegment, withOriginalSpacing } from "./story-edit";

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({ t: (parts: TemplateStringsArray) => parts.join("") }),
}));

type Segment = { id: string; text: string };

function renderSegments(segments: Segment[]) {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(<StoryText segments={segments} />);
  return container.firstElementChild as HTMLElement;
}

/** Renders a passage and rebuilds one entry's Markdown from it, as saving an untouched edit would. */
function roundTrip(segments: Segment[], id: string) {
  const original = segments.find((segment) => segment.id === id)!.text;
  return withOriginalSpacing(
    original,
    serializeSegment(renderSegments(segments), id),
  );
}

describe("story editing", () => {
  it("rebuilds paragraphs, bold and italic as Markdown", () => {
    const text = "The door **creaks** open.\n\nInside, *something* waits.";
    expect(roundTrip([{ id: "a", text }], "a")).toBe(text);
  });

  it("keeps an entry's own text when it shares paragraphs with others", () => {
    const segments = [
      { id: "old", text: "Older **paragraph.**\n\nOlder ending" },
      { id: "new", text: " and *newer prose*." },
    ];
    expect(roundTrip(segments, "old")).toBe(segments[0].text);
    expect(roundTrip(segments, "new")).toBe(segments[1].text);
  });

  it("keeps the blank lines that separate one entry from the next", () => {
    const segments = [
      { id: "a", text: "First reply.\n\n" },
      { id: "b", text: "Second reply." },
    ];
    expect(roundTrip(segments, "a")).toBe("First reply.\n\n");
  });

  it("writes line breaks back and escapes characters typed as plain text", () => {
    const root = renderSegments([{ id: "a", text: "Before" }]);
    const span = root.querySelector('[data-story-segment-id="a"]')!;
    span.append(document.createElement("br"), "5 * 3 = 15");
    expect(serializeSegment(root, "a")).toBe("Before\n5 \\* 3 = 15");
  });

  it("writes bold added while editing back as Markdown", () => {
    const root = renderSegments([{ id: "a", text: "A quiet night." }]);
    const span = root.querySelector('[data-story-segment-id="a"]')!;
    span.textContent = "A ";
    const bold = document.createElement("b");
    bold.textContent = "quiet ";
    span.append(bold, "night.");
    expect(serializeSegment(root, "a")).toBe("A **quiet** night.");
  });
});
