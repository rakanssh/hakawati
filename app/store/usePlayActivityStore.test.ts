import { beforeEach, describe, expect, it } from "vitest";
import {
  beginPlayActivity,
  claimPlayActivity,
  usePlayActivityStore,
  waitForPlayActivity,
} from "./usePlayActivityStore";

beforeEach(() =>
  usePlayActivityStore.setState({
    narrating: 0,
    saving: 0,
    assistantWriting: 0,
  }),
);

describe("play activity", () => {
  it("starts at once when nothing blocks it, and ends once", () => {
    const end = beginPlayActivity("saving");
    expect(usePlayActivityStore.getState().saving).toBe(1);
    end();
    end();
    expect(usePlayActivityStore.getState().saving).toBe(0);
  });

  it("waits for every blocker to finish, then starts in the same step", async () => {
    const endNarration = beginPlayActivity("narrating");
    const endSave = beginPlayActivity("saving");
    let started = false;
    const claim = claimPlayActivity("assistantWriting", [
      "narrating",
      "saving",
    ]).then((end) => {
      started = true;
      return end;
    });
    endNarration();
    await Promise.resolve();
    expect(started).toBe(false);
    endSave();
    const end = await claim;
    expect(usePlayActivityStore.getState().assistantWriting).toBe(1);
    end();
  });

  it("lets the narrator wait for Hakawati, so the two never overlap", async () => {
    const endWriting = beginPlayActivity("assistantWriting");
    const narrator = claimPlayActivity("narrating", ["assistantWriting"]);
    await Promise.resolve();
    expect(usePlayActivityStore.getState().narrating).toBe(0);
    endWriting();
    (await narrator)();
  });

  it("waits until a kind of activity has ended", async () => {
    const endFirst = beginPlayActivity("narrating");
    const endSecond = beginPlayActivity("narrating");
    let done = false;
    const waiting = waitForPlayActivity("narrating").then(() => {
      done = true;
    });
    endFirst();
    await Promise.resolve();
    expect(done).toBe(false);
    endSecond();
    await waiting;
    expect(done).toBe(true);
  });

  it("stops waiting when cancelled", async () => {
    beginPlayActivity("narrating");
    const controller = new AbortController();
    const claim = claimPlayActivity(
      "assistantWriting",
      ["narrating"],
      controller.signal,
    );
    controller.abort();
    await expect(claim).rejects.toMatchObject({ name: "AbortError" });
    expect(usePlayActivityStore.getState().assistantWriting).toBe(0);
  });
});
