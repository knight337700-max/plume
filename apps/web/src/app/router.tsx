import { createBrowserRouter, Outlet, type RouteObject } from "react-router-dom";
import { JacomoWorkflowScreen } from "../screens/e2e/jacomo-workflow-screen";
import { JacomoUserUploadScreen } from "../screens/e2e/jacomo-user-upload-screen";
import { WorkspaceShell } from "../pi4c/shell";
import {
  CampaignAssetsPage,
  CampaignIndexPage,
  CampaignOverviewPage,
  CampaignProjectsPage,
  ChannelFormatPage,
  CreativeSetupPage,
  EditorPage,
  GeneratePage,
  MissingRoutePage,
  ProjectAssetsPage,
  ProjectCreativesPage,
  ProjectOverviewPage,
  SettingsPage,
  WorkspaceEntryPage,
} from "../pi4c/screens";

type ViteImportMeta = ImportMeta & { env?: Record<string, string | undefined> };
const viteEnv = (import.meta as ViteImportMeta).env;
export const apiBaseUrl = viteEnv?.VITE_API_BASE_URL ?? "/api/v1";

function BareLayout() {
  return <Outlet />;
}

function RouteErrorPage() {
  return (
    <main className="g-route-error">
      <h1>Something went wrong.</h1>
      <p>The requested view could not be displayed. Return to the workspace entry and try again.</p>
      <a href="/">Return home</a>
    </main>
  );
}

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <BareLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <WorkspaceEntryPage /> },
      { path: "e2e/jacomo", element: <JacomoWorkflowScreen /> },
      { path: "e2e/jacomo-user-upload", element: <JacomoUserUploadScreen /> },
      {
        path: "w/:workspaceId",
        element: <WorkspaceShell />,
        children: [
          { index: true, element: <CreativeSetupPage /> },
          { path: "ai-creative/setup", element: <CreativeSetupPage /> },
          { path: "ai-creative/format", element: <ChannelFormatPage /> },
          { path: "ai-creative/generate", element: <GeneratePage /> },
          { path: "ai-creative/editor", element: <EditorPage /> },
          { path: "campaigns", element: <CampaignIndexPage /> },
          { path: "campaigns/:campaignId", element: <CampaignOverviewPage /> },
          { path: "campaigns/:campaignId/assets", element: <CampaignAssetsPage /> },
          { path: "campaigns/:campaignId/projects", element: <CampaignProjectsPage /> },
          { path: "campaigns/:campaignId/projects/:projectId", element: <ProjectOverviewPage /> },
          {
            path: "campaigns/:campaignId/projects/:projectId/assets",
            element: <ProjectAssetsPage />,
          },
          {
            path: "campaigns/:campaignId/projects/:projectId/creatives",
            element: <ProjectCreativesPage />,
          },
          { path: "projects/:projectId", element: <ProjectOverviewPage /> },
          { path: "projects/:projectId/assets", element: <ProjectAssetsPage /> },
          { path: "projects/:projectId/creatives", element: <ProjectCreativesPage /> },
          { path: "settings", element: <SettingsPage /> },
          { path: "*", element: <MissingRoutePage /> },
        ],
      },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
