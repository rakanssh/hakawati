import { type RouteConfig, route, index } from "@react-router/dev/routes";

export default [
  index("./pages/home/home.tsx"),
  route("about", "./pages/about/about.tsx"),
  route("demo", "./pages/demo/demo.tsx", [
    // Settings modal nested under demo so it overlays the demo page
    route("settings", "./pages/settings/layout.tsx", [
      index("./pages/settings/index.tsx"),
      route("api", "./pages/settings/api.tsx"),
      route("scenario", "./pages/settings/scenario.tsx"),
      route("story-cards", "./pages/settings/story-cards.tsx"),
      route("model", "./pages/settings/model.tsx"),
    ]),
  ]),

  //   layout("./auth/layout.tsx", [
  //     route("login", "./auth/login.tsx"),
  //     route("register", "./auth/register.tsx"),
  //   ]),

  //   ...prefix("concerts", [
  //     index("./concerts/home.tsx"),
  //     route(":city", "./concerts/city.tsx"),
  //     route("trending", "./concerts/trending.tsx"),
  //   ]),
] satisfies RouteConfig;
