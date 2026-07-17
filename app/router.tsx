import React from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";

import AppShell from "./root";
import Home from "./pages/home/home";
import Play from "./pages/play";
import ScenariosHome from "./pages/scenarios/home";
import ScenarioCreate from "./pages/scenarios/create.tsx";
import ScenarioEdit from "./pages/scenarios/edit.tsx";
import ScenarioDetails from "./pages/scenarios/details.tsx";
import ScenarioCatalogDetails from "./pages/scenarios/catalog-details.tsx";
import TalesHome from "./pages/tales/home";
import { QuickstartPage } from "./components/quickstart";

const RootRoute = createRootRoute({ component: () => <AppShell /> });

const IndexRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/",
  component: Home,
});

const PlayRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "play",
  component: Play,
});

const routeTree = RootRoute.addChildren([
  IndexRoute,
  PlayRoute,
  createRoute({
    getParentRoute: () => RootRoute,
    path: "scenarios",
    component: ScenariosHome,
  }),
  createRoute({
    getParentRoute: () => RootRoute,
    path: "tales",
    component: TalesHome,
  }),
  createRoute({
    getParentRoute: () => RootRoute,
    path: "quickstart",
    component: QuickstartPage,
  }),
  createRoute({
    getParentRoute: () => RootRoute,
    path: "scenarios/new",
    component: ScenarioCreate,
  }),
  createRoute({
    getParentRoute: () => RootRoute,
    path: "scenarios/catalog/$id",
    component: ScenarioCatalogDetails,
  }),
  createRoute({
    getParentRoute: () => RootRoute,
    path: "scenarios/$id/edit",
    component: ScenarioEdit,
  }),
  createRoute({
    getParentRoute: () => RootRoute,
    path: "scenarios/$id",
    component: ScenarioDetails,
  }),
]);

export const router = createRouter({
  routeTree,
});

export function AppRouter(): React.JSX.Element {
  return <RouterProvider router={router} />;
}
