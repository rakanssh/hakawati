const SYNC_WAKE_EVENT = "hakawati-sync-wake";
const SYNC_CHANGED_EVENT = "hakawati-sync-changed";

export function wakeSyncBackground() {
  window.dispatchEvent(new Event(SYNC_WAKE_EVENT));
}

export function addSyncWakeListener(listener: () => void) {
  window.addEventListener(SYNC_WAKE_EVENT, listener);
  return () => window.removeEventListener(SYNC_WAKE_EVENT, listener);
}

export function notifySyncChanged() {
  window.dispatchEvent(new Event(SYNC_CHANGED_EVENT));
}

export function addSyncChangedListener(listener: () => void) {
  window.addEventListener(SYNC_CHANGED_EVENT, listener);
  return () => window.removeEventListener(SYNC_CHANGED_EVENT, listener);
}
