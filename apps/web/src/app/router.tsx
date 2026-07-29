import { createBrowserRouter, Outlet, type RouteObject } from "react-router-dom";
import { JacomoWorkflowScreen } from "../screens/e2e/jacomo-workflow-screen";

type ViteImportMeta = ImportMeta & {
  env?: Record<string, string | undefined>;
};

const viteEnv = (import.meta as ViteImportMeta).env;

export const apiBaseUrl = viteEnv?.VITE_API_BASE_URL ?? "/api/v1";

function AppLayout() {
  return (
    <div>
      <header>
        <a href="/">Plume</a>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

function HomePage() {
  return (
    <section aria-labelledby="welcome-heading">
      <h1 id="welcome-heading">Creative work, in one place.</h1>
      <p>Start a campaign to turn an idea into an approved deliverable.</p>
    </section>
  );
}

function RouteErrorPage() {
  return (
    <section aria-labelledby="route-error-heading">
      <h1 id="route-error-heading">Something went wrong.</h1>
      <p>Try returning to the Plume home page.</p>
      <a href="/">Return home</a>
    </section>
  );
}

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <AppLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "e2e/jacomo", element: <JacomoWorkflowScreen /> },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
