import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ScenarioBasicsFields,
  type ScenarioBasicsFieldsProps,
} from "./ScenarioBasicsFields";

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: unknown }) => children,
  useLingui: () => ({
    t: (parts: TemplateStringsArray, ...values: unknown[]) =>
      parts.reduce(
        (text, part, index) => `${text}${part}${values[index] ?? ""}`,
        "",
      ),
  }),
}));

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const jpeg = new Uint8Array([255, 216, 255]);
const OriginalURL = URL;

describe("ScenarioBasicsFields", () => {
  let root: Root;
  let container: HTMLDivElement;
  const onNameChange = vi.fn();
  const onDescriptionChange = vi.fn();
  const onThumbnailChange = vi.fn();
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
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  function render(props: Partial<ScenarioBasicsFieldsProps> = {}) {
    act(() =>
      root.render(
        <ScenarioBasicsFields
          name="Window Four"
          description="A routine renewal."
          onNameChange={onNameChange}
          onDescriptionChange={onDescriptionChange}
          onThumbnailChange={onThumbnailChange}
          {...props}
        />,
      ),
    );
  }

  function button(text: string) {
    const element = [...container.querySelectorAll("button")].find(
      (item) => item.textContent?.trim() === text,
    );
    if (!element) throw new Error(`Missing button: ${text}`);
    return element;
  }

  function file(bytes: Uint8Array, name = "cover.png") {
    const result = new File([bytes.slice().buffer], name, {
      type: "image/png",
    });
    Object.defineProperty(result, "arrayBuffer", {
      value: vi.fn().mockResolvedValue(bytes.slice().buffer),
    });
    return result;
  }

  async function selectFile(selected: File) {
    const input =
      container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [selected],
    });
    Object.defineProperty(input, "value", {
      configurable: true,
      writable: true,
      value: `C:\\fakepath\\${selected.name}`,
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(input.value).toBe("");
  }

  it("replaces and removes the cover, releasing previews when they change or unmount", async () => {
    render({ thumbnail: png });
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "blob:cover-1",
    );
    const input =
      container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const openPicker = vi.spyOn(input, "click");
    act(() => button("Replace cover").click());
    expect(openPicker).toHaveBeenCalledOnce();
    expect(input.accept).toBe("image/jpeg,image/png,image/webp");

    await selectFile(file(jpeg, "new-cover.jpg"));
    expect(onThumbnailChange).toHaveBeenLastCalledWith(jpeg);
    render({ thumbnail: jpeg });
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:cover-1");
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "blob:cover-2",
    );

    act(() => button("Remove cover").click());
    expect(onThumbnailChange).toHaveBeenLastCalledWith(null);
    render({ thumbnail: null });
    expect(container.querySelector("img")).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:cover-2");

    render({ thumbnail: png });
    act(() => root.render(null));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:cover-3");
  });

  it("keeps the current cover after a failed read and allows selecting the same file again", async () => {
    render({ thumbnail: png });
    const selected = file(jpeg);
    vi.mocked(selected.arrayBuffer)
      .mockRejectedValueOnce(new Error("File unavailable"))
      .mockResolvedValue(jpeg.slice().buffer);

    await selectFile(selected);
    expect(onThumbnailChange).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "The cover image could not be read. Please choose it again.",
    );
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "blob:cover-1",
    );
    await selectFile(selected);
    expect(onThumbnailChange).toHaveBeenCalledWith(jpeg);
    expect(container.querySelector('[role="alert"]')).toBeNull();

    await selectFile(file(new TextEncoder().encode("<svg></svg>")));
    expect(onThumbnailChange).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Choose a JPEG, PNG, or WebP image.",
    );
  });

  it("ignores a file read that completes after the editor closes", async () => {
    render();
    let finish!: (value: ArrayBuffer) => void;
    const selected = file(png);
    vi.mocked(selected.arrayBuffer).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await selectFile(selected);
    expect(button("Reading cover…").disabled).toBe(true);
    act(() => root.render(null));
    await act(async () => finish(png.slice().buffer));
    expect(onThumbnailChange).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("explains publishing limits without truncating drafts and disables every control when requested", () => {
    const name = "N".repeat(161);
    const description = "D".repeat(601);
    render({ name, description, thumbnail: png });
    const nameInput = container.querySelector<HTMLInputElement>(
      'input:not([type="file"])',
    )!;
    const descriptionInput = container.querySelector("textarea")!;
    expect(nameInput.value).toBe(name);
    expect(descriptionInput.value).toBe(description);
    expect(nameInput.hasAttribute("maxlength")).toBe(false);
    expect(descriptionInput.hasAttribute("maxlength")).toBe(false);
    expect(container.textContent).toContain(
      "601/600 characters for publishing",
    );
    expect(container.textContent).toContain(
      "Shorten the name to 160 characters",
    );
    expect(container.textContent).toContain(
      "Shorten the description to 600 characters",
    );
    for (const input of [nameInput, descriptionInput]) {
      expect(
        container.querySelector(`label[for="${input.id}"]`),
      ).not.toBeNull();
    }

    render({ name, description, thumbnail: png, disabled: true });
    for (const input of container.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement
    >("input, textarea, button")) {
      expect(input.disabled).toBe(true);
    }
    act(() => button("Remove cover").click());
    expect(onThumbnailChange).not.toHaveBeenCalled();
  });
});
