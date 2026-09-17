import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCoverImageUrl } from "./useCoverImageUrl";

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const jpeg = new Uint8Array([255, 216, 255]);
const OriginalURL = URL;

describe("useCoverImageUrl", () => {
  let root: Root;
  let container: HTMLDivElement;
  const createObjectURL = vi.fn();
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.resetAllMocks();
    let nextUrl = 0;
    createObjectURL.mockImplementation(() => `blob:cover-${++nextUrl}`);
    vi.stubGlobal(
      "URL",
      class extends OriginalURL {
        static createObjectURL = createObjectURL;
        static revokeObjectURL = revokeObjectURL;
      },
    );
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  });

  function Cover({ bytes }: { bytes?: Uint8Array | null }) {
    const url = useCoverImageUrl(bytes);
    return createElement("img", { src: url || "placeholder.png" });
  }

  function render(bytes?: Uint8Array | null) {
    act(() => root.render(createElement(Cover, { bytes })));
    return container.querySelector("img")!.getAttribute("src");
  }

  it("keeps the same image source when sync refetches unchanged cover bytes", () => {
    expect(render(png)).toBe("blob:cover-1");
    const image = container.querySelector("img");
    expect(render(png)).toBe("blob:cover-1");
    expect(render(png.slice())).toBe("blob:cover-1");
    expect(container.querySelector("img")).toBe(image);
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it("updates changed or removed covers and releases their URLs", () => {
    render(png);
    expect(createObjectURL.mock.calls[0][0].type).toBe("image/png");
    expect(render(jpeg)).toBe("blob:cover-2");
    expect(createObjectURL.mock.calls[1][0].type).toBe("image/jpeg");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:cover-1");
    expect(render(null)).toBe("placeholder.png");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:cover-2");
    expect(render(new Uint8Array())).toBe("placeholder.png");
    expect(createObjectURL).toHaveBeenCalledTimes(2);
    render(png);
    act(() => root.render(null));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:cover-3");
  });

  it("recreates a usable cover after development Strict Mode effect cleanup", () => {
    act(() =>
      root.render(
        createElement(StrictMode, null, createElement(Cover, { bytes: png })),
      ),
    );
    const visibleUrl = container.querySelector("img")!.getAttribute("src");
    expect(visibleUrl).toBe("blob:cover-2");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:cover-1");
    expect(revokeObjectURL).not.toHaveBeenCalledWith(visibleUrl);
  });
});
