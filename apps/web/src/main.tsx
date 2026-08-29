import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import "./styles/astryx.css";
import { queryClient } from "./app/query-client";
import { createAppRouter } from "./app/router";
import { ThemeProvider } from "./pi4c/theme";

type BrowserRuntime = {
  document?: {
    getElementById(id: string): unknown;
  };
};

const rootElement = (globalThis as BrowserRuntime).document?.getElementById("root");

if (!rootElement) {
  throw new Error("Plume requires a root element to mount the application.");
}

createRoot(rootElement as Parameters<typeof createRoot>[0]).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RouterProvider router={createAppRouter()} />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
