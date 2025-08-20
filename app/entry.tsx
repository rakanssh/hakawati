import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppRouter } from "./router";

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found");

createRoot(root).render(
  <StrictMode>
    <AppRouter />
  </StrictMode>
);
