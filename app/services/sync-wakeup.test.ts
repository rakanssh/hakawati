import { describe, expect, it, vi } from "vitest";
import {
  addSyncChangedListener,
  addSyncWakeListener,
  notifySyncChanged,
  wakeSyncBackground,
} from "./sync-wakeup";

describe("sync wake events", () => {
  it("keeps wake and changed notifications separate", () => {
    const wake = vi.fn();
    const changed = vi.fn();
    const removeWake = addSyncWakeListener(wake);
    const removeChanged = addSyncChangedListener(changed);

    wakeSyncBackground();

    expect(wake).toHaveBeenCalledOnce();
    expect(changed).not.toHaveBeenCalled();

    notifySyncChanged();

    expect(wake).toHaveBeenCalledOnce();
    expect(changed).toHaveBeenCalledOnce();

    removeWake();
    removeChanged();
  });

  it("removes listeners", () => {
    const wake = vi.fn();
    const changed = vi.fn();
    const removeWake = addSyncWakeListener(wake);
    const removeChanged = addSyncChangedListener(changed);

    removeWake();
    removeChanged();
    wakeSyncBackground();
    notifySyncChanged();

    expect(wake).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
  });
});
