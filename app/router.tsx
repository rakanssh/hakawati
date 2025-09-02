import React from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";

import AppShell from "./root";
import Home from "./pages/home/home";
import Demo from "./pages/demo/demo";
import ScenariosHome from "./pages/scenarios/home";
import ScenarioCreate from "./pages/scenarios/create.tsx";
import ScenarioEdit from "./pages/scenarios/edit.tsx";
import TalesHome from "./pages/tales/home";

const RootRoute = createRootRoute({ component: () => <AppShell /> });

const IndexRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/",
  component: Home,
});

const DemoRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "demo",
  component: Demo,
});

const routeTree = RootRoute.addChildren([
  IndexRoute,
  DemoRoute,
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
    path: "scenarios/new",
    component: ScenarioCreate,
  }),
  createRoute({
    getParentRoute: () => RootRoute,
    path: "scenarios/$id",
    component: ScenarioEdit,
  }),
]);

export const router = createRouter({
  routeTree,
});

export function AppRouter(): React.JSX.Element {
  return <RouterProvider router={router} />;
}
