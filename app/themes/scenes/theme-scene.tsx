import { lazy, Suspense, type ComponentType } from "react";
import { useTheme } from "@/components/theme-provider";
import { useThemeScenery } from "@/hooks/useThemeScenery";
import type { ThemeId } from "../registry";

export interface SceneProps {
  /** The Game Master sidebar is open beside the story. */
  withSidebar: boolean;
}

// Scenes are loaded on demand, so only the active theme's drawing code is fetched.
const scenes: Partial<Record<ThemeId, ComponentType<SceneProps>>> = {
  orbit: lazy(() => import("./orbit-scene")),
  phosphor: lazy(() => import("./phosphor-scene")),
  cartridge: lazy(() => import("./cartridge-scene")),
  "rain-on-glass": lazy(() => import("./rain-scene")),
  storybook: lazy(() => import("./storybook-scene")),
  typewriter: lazy(() => import("./typewriter-scene")),
};

/** Draws the active theme's scenery around the play screen. */
export function ThemeScene({ withSidebar }: SceneProps) {
  const { theme } = useTheme();
  const scenery = useThemeScenery();
  const Scene = scenery === "off" ? undefined : scenes[theme.id];
  if (!Scene) return null;

  return (
    <Suspense fallback={null}>
      <Scene key={theme.id} withSidebar={withSidebar} />
    </Suspense>
  );
}
