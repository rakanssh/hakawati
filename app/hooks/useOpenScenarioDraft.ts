import { useEffect, useRef } from "react";
import {
  useScenarioDraftStore,
  type OpenScenarioDraft,
} from "@/store/useScenarioDraftStore";
import type { Scenario } from "@/types/context.type";

/** Lets Hakawati read and fill in the scenario form while it is open. */
export function useOpenScenarioDraft(
  scenario: Scenario,
  setScenario: (scenario: Scenario) => void,
  ready = true,
) {
  const latest = useRef(scenario);
  latest.current = scenario;

  useEffect(() => {
    if (!ready) return;
    const draft: OpenScenarioDraft = {
      read: () => latest.current,
      write: (next) => {
        latest.current = next;
        setScenario(next);
      },
    };
    useScenarioDraftStore.setState({ draft });
    return () => {
      if (useScenarioDraftStore.getState().draft === draft)
        useScenarioDraftStore.setState({ draft: null });
    };
  }, [ready, setScenario]);
}
