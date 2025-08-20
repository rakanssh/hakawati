import React from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";

import AppShell from "./root";
import Home from "./pages/home/home";
// import About from "./pages/about/about";
import Demo from "./pages/demo/demo";
import SettingsLayout from "./pages/settings/layout";
import SettingsIndex from "./pages/settings/index";
import SettingsApi from "./pages/settings/api";
import SettingsScenario from "./pages/settings/scenario";
import SettingsStoryCards from "./pages/settings/story-cards";
import SettingsModel from "./pages/settings/model";

const RootRoute = createRootRoute({ component: () => <AppShell /> });

const IndexRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/",
  component: Home,
});

// const AboutRoute = createRoute({
//   getParentRoute: () => RootRoute,
//   path: "about",
//   component: About,
// });

const DemoRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "demo",
  component: Demo,
});

const SettingsRoute = createRoute({
  getParentRoute: () => DemoRoute,
  path: "settings",
  component: SettingsLayout,
});

const SettingsIndexRoute = createRoute({
  getParentRoute: () => SettingsRoute,
  path: "/",
  component: SettingsIndex,
});

const SettingsApiRoute = createRoute({
  getParentRoute: () => SettingsRoute,
  path: "api",
  component: SettingsApi,
});

const SettingsScenarioRoute = createRoute({
  getParentRoute: () => SettingsRoute,
  path: "scenario",
  component: SettingsScenario,
});

const SettingsStoryCardsRoute = createRoute({
  getParentRoute: () => SettingsRoute,
  path: "story-cards",
  component: SettingsStoryCards,
});

const SettingsModelRoute = createRoute({
  getParentRoute: () => SettingsRoute,
  path: "model",
  component: SettingsModel,
});

const routeTree = RootRoute.addChildren([
  IndexRoute,
  // AboutRoute,
  DemoRoute.addChildren([
    SettingsRoute.addChildren([
      SettingsIndexRoute,
      SettingsApiRoute,
      SettingsScenarioRoute,
      SettingsStoryCardsRoute,
      SettingsModelRoute,
    ]),
  ]),
]);

export const router = createRouter({
  routeTree,
});

export function AppRouter(): React.JSX.Element {
  return <RouterProvider router={router} />;
}
