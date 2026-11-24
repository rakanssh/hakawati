import { i18n } from "@lingui/core";
import { toast } from "sonner";

export function showSaveError() {
  toast.error(i18n._("Failed to save progress"), { id: "save-failed" });
}
