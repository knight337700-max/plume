import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CatalogAdminScreen } from "../src/screens/catalog/catalog-admin-screen.js";
import { JobCenterScreen } from "../src/screens/jobs/job-center-screen.js";
import {
  SettingsScreen,
  createSettingsSaver,
  type SettingsApiClient,
} from "../src/screens/settings/settings-screen.js";

describe("CATALOG-01, JOB-01, and SET-01 contract fixtures", () => {
  it("guards catalog administration by role", () => {
    const viewerHtml = renderToStaticMarkup(
      createElement(CatalogAdminScreen, {
        role: "VIEWER",
        entries: [{ id: "format-1", name: "Square 1:1", kind: "format", status: "active", revision: "3" }],
      }),
    );
    const adminHtml = renderToStaticMarkup(
      createElement(CatalogAdminScreen, {
        role: "ADMIN",
        entries: [{ id: "format-1", name: "Square 1:1", kind: "format", status: "active", revision: "3" }],
      }),
    );

    expect(viewerHtml).toContain('data-screen-state="no-access"');
    expect(viewerHtml).toContain("Admin access required");
    expect(viewerHtml).not.toContain("Square 1:1");
    expect(adminHtml).toContain('data-screen-id="CATALOG-01"');
    expect(adminHtml).toContain("Square 1:1");
  });

  it("exposes retry for failed jobs and cancel for in-flight jobs", () => {
    const html = renderToStaticMarkup(
      createElement(JobCenterScreen, {
        role: "ADMIN",
        jobs: [
          { id: "job-failed", label: "Render failed", status: "failed", message: "Renderer stopped." },
          { id: "job-running", label: "Export running", status: "running", progress: 42 },
        ],
        onRetry: () => undefined,
        onCancel: () => undefined,
      }),
    );

    expect(html).toContain('data-screen-id="JOB-01"');
    expect(html).toContain('data-job-action="retry"');
    expect(html).toContain('data-job-action="cancel"');
    expect(html).toContain("42%");
  });

  it("sends the current ETag as If-Match when saving settings", async () => {
    let receivedInit: RequestInit | undefined;
    const client: SettingsApiClient = {
      async put<T>(_path: string, _body: unknown, init?: RequestInit) {
        receivedInit = init;
        return { data: { etag: "etag-2" } } as T;
      },
    };
    const save = createSettingsSaver(client, "workspace-1");
    const nextEtag = await save({ timezone: "Asia/Seoul" }, "etag-1");
    const html = renderToStaticMarkup(
      createElement(SettingsScreen, {
        role: "ADMIN",
        etag: "etag-1",
        settings: { timezone: "Asia/Seoul" },
        onSave: () => undefined,
      }),
    );
    const headers = new Headers(receivedInit?.headers);

    expect(nextEtag).toBe("etag-2");
    expect(headers.get("If-Match")).toBe("etag-1");
    expect(html).toContain('data-screen-id="SET-01"');
    expect(html).toContain("ETag: etag-1");
    expect(html).toContain("Save settings");
  });
});
