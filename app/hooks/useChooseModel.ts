import { useCallback } from "react";
import { toast } from "sonner";
import { useLingui } from "@lingui/react/macro";
import { chooseRoleModel } from "@/services/model-choice";
import type { LLMModel, ModelRole } from "@/types";

/** Sets a role's model the same way wherever it is chosen. */
export function useChooseModel(role: ModelRole) {
  const { t } = useLingui();
  return useCallback(
    (model: LLMModel) => {
      for (const warning of chooseRoleModel(role, model))
        toast.warning(
          warning === "narrator_tools"
            ? t`Model cannot be confirmed to support tool calling. GM mode may not work properly.`
            : t`Model cannot be confirmed to support tool calling. Hakawati may not be able to make changes.`,
        );
    },
    [role, t],
  );
}
