import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameMode, type Scenario } from "@/types/context.type";
import type { ScenarioBasicsFieldsProps } from "@/components/scenario/ScenarioBasicsFields";
import type { PublishScenarioDialog } from "@/components/scenario/PublishScenarioDialog";
import ScenarioEdit from "./edit";

type PublishInput = Parameters<
  ComponentProps<typeof PublishScenarioDialog>["onPublish"]
>[0];

const mocks = vi.hoisted(() => ({
  routeId: "scenario-1",
  navigate: vi.fn(),
  getScenario: vi.fn(),
  saveScenario: vi.fn(),
  prepare: vi.fn(),
  markCover: vi.fn(),
  publish: vi.fn(),
  refresh: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  authTransport: {},
  publishInput: null as PublishInput | null,
}));

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
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useParams: () => ({ id: mocks.routeId }),
}));
vi.mock("@/hooks/useGameSaves", () => ({
  useLoadTale: () => ({ load: vi.fn() }),
}));
vi.mock("@/hooks/useCatalogScenarios", () => ({
  useCatalogClient: () => ({
    enabled: true,
    signedIn: true,
    publishingEnabled: true,
    thumbnailUploads: true,
    authTransport: mocks.authTransport,
  }),
  useCatalogActions: () => ({ publish: mocks.publish }),
  useScenarioPublishLinks: () => ({
    links: [{ localScenarioId: "scenario-1", catalogScenarioId: "public-1" }],
    refresh: mocks.refresh,
  }),
}));
vi.mock("@/services/scenario.service", () => ({
  getScenarioById: mocks.getScenario,
  saveScenario: mocks.saveScenario,
}));
vi.mock("@/services/catalog.service", () => ({
  prepareScenarioPublishDraft: mocks.prepare,
}));
vi.mock("@/repositories/scenario-publish-link.repository", () => ({
  markScenarioDraftCoverInitialized: mocks.markCover,
}));
vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));
vi.mock("@/hooks/useScenarioForm", () => ({
  useScenarioForm: () => ({
    fields: {
      components: [],
      initialStats: [],
      initialInventory: [],
      initialStoryCards: [],
    },
  }),
}));
vi.mock("@/components/scenario/ScenarioBasicsFields", () => ({
  ScenarioBasicsFields: (props: ScenarioBasicsFieldsProps) => (
    <div>
      <input
        aria-label="Name"
        disabled={props.disabled}
        value={props.name}
        onChange={(event) => props.onNameChange(event.target.value)}
      />
      <textarea
        aria-label="Description"
        disabled={props.disabled}
        value={props.description}
        onChange={(event) => props.onDescriptionChange(event.target.value)}
      />
      <button
        disabled={props.disabled}
        onClick={() => props.onThumbnailChange(null)}
      >
        Remove cover
      </button>
    </div>
  ),
}));
vi.mock("@/components/scenario/PublishScenarioDialog", () => ({
  PublishScenarioDialog: (
    props: ComponentProps<typeof PublishScenarioDialog>,
  ) =>
    props.open ? (
      <div role="dialog">
        <p>{props.scenario?.name}</p>
        <button
          onClick={async () => {
            await props.onPublish(mocks.publishInput!);
          }}
        >
          Confirm publication
        </button>
      </div>
    ) : null,
}));
vi.mock("@/components/scenario/ScenarioBreadcrumb", () => ({
  ScenarioBreadcrumb: () => null,
}));
vi.mock("@/components/scenario/GameModeField", () => ({
  GameModeField: () => null,
}));
vi.mock("@/components/scenario/StatsEditor", () => ({
  StatsEditor: () => null,
}));
vi.mock("@/components/scenario/InventoryEditor", () => ({
  InventoryEditor: () => null,
}));
vi.mock("@/components/storybook", () => ({
  StorybookEditor: () => null,
}));
vi.mock("@/components/prompt-components/PromptComponentsEditor", () => ({
  PromptComponentsEditor: () => null,
}));
vi.mock("@/components/scenario/ScenarioQuestionsHelp", () => ({
  ScenarioQuestionErrors: () => null,
  ScenarioQuestionsHelp: () => null,
}));

function initialScenario(id = "scenario-1"): Scenario {
  return {
    id,
    name: "Old draft name",
    description: "Old draft description",
    initialGameMode: GameMode.STORY_TELLER,
    thumbnail: new Uint8Array([1, 2, 3]),
    content: [],
  };
}

describe("scenario draft editing and publication", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.resetAllMocks();
    mocks.routeId = "scenario-1";
    mocks.publishInput = null;
    mocks.getScenario.mockResolvedValue(initialScenario());
    mocks.prepare.mockImplementation(async (scenario: Scenario) => ({
      scenario,
      published: null,
    }));
    mocks.saveScenario.mockResolvedValue("scenario-1");
    mocks.publish.mockResolvedValue({ moderation: { status: "approved" } });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function render() {
    await act(async () => root.render(<ScenarioEdit />));
  }

  function button(text: string) {
    const found = [...container.querySelectorAll("button")].find(
      (item) => item.textContent?.trim() === text,
    );
    if (!found) throw new Error(`Missing button: ${text}`);
    return found;
  }

  async function click(text: string) {
    await act(async () => button(text).click());
  }

  function fill(label: "Name" | "Description", value: string) {
    const input = container.querySelector<
      HTMLInputElement | HTMLTextAreaElement
    >(`[aria-label="${label}"]`)!;
    act(() => {
      Object.getOwnPropertyDescriptor(
        label === "Name"
          ? HTMLInputElement.prototype
          : HTMLTextAreaElement.prototype,
        "value",
      )!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  it("saves name, description and cover removal only as a draft", async () => {
    await render();
    fill("Name", "New draft name");
    fill("Description", "New draft description");
    await click("Remove cover");
    await click("Save draft");

    expect(mocks.saveScenario).toHaveBeenCalledWith(
      {
        ...initialScenario(),
        name: "New draft name",
        description: "New draft description",
        thumbnail: null,
      },
      "scenario-1",
    );
    expect(mocks.markCover).toHaveBeenCalledWith("scenario-1");
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/scenarios/scenario-1",
    });
  });

  it("saves the current draft before preview and publishes the dialog's prepared scenario", async () => {
    await render();
    fill("Name", "The saved update");
    let finishSave!: (id: string) => void;
    mocks.saveScenario.mockReturnValueOnce(
      new Promise<string>((resolve) => {
        finishSave = resolve;
      }),
    );
    await click("Publish update");
    expect(mocks.saveScenario).toHaveBeenCalledWith(
      expect.objectContaining({ name: "The saved update" }),
      "scenario-1",
    );
    expect(button("Publish update").disabled).toBe(true);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(mocks.publish).not.toHaveBeenCalled();

    await act(async () => finishSave("scenario-1"));
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain(
      "The saved update",
    );
    const prepared = {
      ...initialScenario(),
      name: "The saved update",
      thumbnail: new Uint8Array([8, 9, 10]),
    };
    mocks.publishInput = {
      scenario: prepared,
      tags: ["surreal"],
      policyAcceptance: {} as PublishInput["policyAcceptance"],
    };
    await click("Confirm publication");
    expect(mocks.publish).toHaveBeenCalledWith(mocks.publishInput);
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    await click("Save draft");
    expect(mocks.saveScenario).toHaveBeenLastCalledWith(prepared, "scenario-1");
  });

  it("does not open publication when saving the draft fails", async () => {
    await render();
    mocks.saveScenario.mockRejectedValueOnce(new Error("Disk unavailable"));
    await click("Publish update");
    expect(mocks.toastError).toHaveBeenCalledWith("Disk unavailable");
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(button("Publish update").disabled).toBe(false);
  });

  it("keeps the new scenario's identity when an older save finishes", async () => {
    await render();
    let finishSave!: (id: string) => void;
    mocks.saveScenario.mockReturnValueOnce(
      new Promise<string>((resolve) => {
        finishSave = resolve;
      }),
    );
    await click("Publish update");
    mocks.routeId = "scenario-2";
    mocks.getScenario.mockResolvedValueOnce(initialScenario("scenario-2"));
    await render();
    await act(async () => finishSave("scenario-1"));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(mocks.navigate).not.toHaveBeenCalled();
    fill("Name", "Second draft");
    mocks.saveScenario.mockResolvedValueOnce("scenario-2");
    await click("Save draft");
    expect(mocks.saveScenario).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "scenario-2", name: "Second draft" }),
      "scenario-2",
    );
  });

  it("does not overwrite a different scenario after an older cover recovery finishes", async () => {
    let finishOldLoad!: (value: {
      scenario: Scenario;
      published: null;
    }) => void;
    mocks.prepare.mockReturnValueOnce(
      new Promise((resolve) => {
        finishOldLoad = resolve;
      }),
    );
    await render();
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "Loading scenario",
    );
    mocks.routeId = "scenario-2";
    mocks.getScenario.mockResolvedValueOnce({
      ...initialScenario("scenario-2"),
      name: "The second scenario",
    });
    await render();
    fill("Name", "Edited second scenario");
    await act(async () =>
      finishOldLoad({ scenario: initialScenario(), published: null }),
    );
    expect(
      container.querySelector<HTMLInputElement>('[aria-label="Name"]')?.value,
    ).toBe("Edited second scenario");
  });
});
