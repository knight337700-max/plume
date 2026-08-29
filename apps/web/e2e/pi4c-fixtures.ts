import type { Page, Route } from "@playwright/test";

export const ids = {
  workspace: "11111111-1111-4111-8111-111111111111",
  brand: "22222222-2222-4222-8222-222222222222",
  campaign: "33333333-3333-4333-8333-333333333333",
  project: "44444444-4444-4444-8444-444444444444",
  assetVersion: "55555555-5555-4555-8555-555555555555",
  projectAsset: "66666666-6666-4666-8666-666666666666",
  set: "77777777-7777-4777-8777-777777777777",
  creative: "88888888-8888-4888-8888-888888888888",
  version: "99999999-9999-4999-8999-999999999999",
  job: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
} as const;

const campaign = {
  id: ids.campaign,
  workspaceId: ids.workspace,
  brandId: ids.brand,
  displayCode: "GB-2026-08",
  name: "Autumn Signal Launch",
  objectiveCode: "CONVERSION",
  status: "ACTIVE",
  startDate: "2026-09-01",
  endDate: "2026-10-15",
  revisionNo: 4,
};
const project = {
  id: ids.project,
  workspaceId: ids.workspace,
  campaignId: ids.campaign,
  name: "Kakao First Flight",
  description: "Launch creatives for the first approved Kakao Moment formats.",
  status: "ACTIVE",
  revisionNo: 3,
  updatedAt: "2026-08-28T10:00:00.000Z",
};
const effectiveAssets = [
  {
    assetVersionId: ids.assetVersion,
    productId: "product-morning",
    roleCode: "PRODUCT",
    source: "CAMPAIGN",
    eligible: true,
    licenseStatus: "ACTIVE",
    name: "Morning serum hero",
  },
  {
    assetVersionId: "55555555-5555-4555-8555-555555555556",
    productId: "product-morning",
    roleCode: "BACKGROUND",
    source: "PROJECT",
    eligible: true,
    licenseStatus: "ACTIVE",
    name: "Soft cobalt gradient",
  },
  {
    assetVersionId: "55555555-5555-4555-8555-555555555557",
    productId: "product-morning",
    roleCode: "LOGO",
    source: "BOTH",
    eligible: true,
    licenseStatus: "ACTIVE",
    name: "Gobanos campaign lockup",
  },
];
const creativeSet = {
  id: ids.set,
  campaignId: ids.campaign,
  projectId: ids.project,
  name: "Autumn Signal · Kakao",
  generationRequestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  status: "GENERATED",
  updatedAt: "2026-08-28T10:10:00.000Z",
};
const creatives = [
  {
    id: ids.creative,
    creativeSetId: ids.set,
    campaignId: ids.campaign,
    productId: "product-morning",
    campaignFormatSelectionId: "selection-1",
    currentVersionId: ids.version,
    status: "GENERATED",
    revisionNo: 2,
  },
  {
    id: "88888888-8888-4888-8888-888888888889",
    creativeSetId: ids.set,
    campaignId: ids.campaign,
    productId: "product-morning",
    campaignFormatSelectionId: "selection-2",
    currentVersionId: "99999999-9999-4999-8999-999999999998",
    status: "READY_FOR_APPROVAL",
    revisionNo: 2,
  },
  {
    id: "88888888-8888-4888-8888-888888888887",
    creativeSetId: ids.set,
    campaignId: ids.campaign,
    productId: "product-morning",
    campaignFormatSelectionId: "selection-3",
    currentVersionId: "99999999-9999-4999-8999-999999999997",
    status: "APPROVED",
    revisionNo: 4,
  },
];
const version = (id: string = ids.version) => ({
  data: {
    id,
    creativeId: ids.creative,
    versionNo: 1,
    formatProfileId: "kakao-moment-display-native-2-1-1200x600",
    status: "DRAFT",
    revisionNo: 2,
    documentJson: {
      id: "creative-document",
      width: 1200,
      height: 600,
      elements: [
        { id: "background", name: "Cobalt background", type: "SHAPE" },
        { id: "product", name: "Morning serum", type: "IMAGE" },
        { id: "headline", name: "Human judgment amplified", type: "TEXT" },
        { id: "logo", name: "Gobanos", type: "IMAGE" },
      ],
    },
  },
});

async function fulfill(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

export async function mockPi4cApi(page: Page) {
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/v1/, "");
    if (request.method() === "POST" && path.endsWith("/generation-requests"))
      return fulfill(
        route,
        {
          job: { id: ids.job, status: "QUEUED" },
          links: { self: `/api/v1/workspaces/${ids.workspace}/jobs/${ids.job}` },
        },
        202,
      );
    if (request.method() === "POST" && path.endsWith(".retry"))
      return fulfill(route, { job: { id: ids.job, status: "QUEUED" } }, 202);
    if (request.method() === "POST" && path.endsWith(".cancel"))
      return fulfill(route, { data: { id: ids.job, status: "CANCELED" } });
    if (request.method() === "POST" && path.endsWith(`/campaigns/${ids.campaign}/projects`))
      return fulfill(route, { data: project }, 201);
    if (request.method() === "POST" && path.endsWith(`/projects/${ids.project}/assets`))
      return fulfill(
        route,
        {
          data: {
            id: ids.projectAsset,
            assetVersionId: ids.assetVersion,
            roleCode: "REFERENCE",
            createdAt: "2026-08-28T10:00:00.000Z",
          },
        },
        201,
      );
    if (request.method() === "DELETE" && path.includes(`/projects/${ids.project}/assets/`))
      return fulfill(route, undefined, 204);
    if (request.method() === "PATCH" && path.endsWith(`/projects/${ids.project}`))
      return fulfill(route, { data: { ...project, ...request.postDataJSON(), revisionNo: 4 } });
    if (request.method() === "DELETE" && path.endsWith(`/projects/${ids.project}`))
      return fulfill(route, undefined, 204);
    if (request.method() === "PUT" && path.endsWith(`/campaigns/${ids.campaign}/channels`))
      return fulfill(route, {
        items: [{ id: "channel-selection-1", channelCode: "KAKAO_MOMENT", status: "SELECTED" }],
      });
    if (request.method() === "PUT" && path.endsWith(`/campaigns/${ids.campaign}/format-selections`))
      return fulfill(route, {
        items: [
          {
            id: "selection-1",
            channelCode: "KAKAO_MOMENT",
            formatProfileId: "kakao-moment-bizboard-1029x258",
            profileVersion: "2026.1",
            status: "SELECTED",
          },
          {
            id: "selection-3",
            channelCode: "KAKAO_MOMENT",
            formatProfileId: "kakao-moment-display-native-2-1-1200x600",
            profileVersion: "2026.1",
            status: "SELECTED",
          },
        ],
      });
    if (path.endsWith(`/workspaces/${ids.workspace}/campaigns`))
      return fulfill(route, { items: [campaign] });
    if (path.endsWith(`/campaigns/${ids.campaign}/projects`))
      return fulfill(route, {
        items: [
          project,
          {
            ...project,
            id: "44444444-4444-4444-8444-444444444443",
            name: "Naver Catalog Watch",
            status: "ACTIVE",
            revisionNo: 1,
          },
        ],
      });
    if (path.endsWith(`/campaigns/${ids.campaign}`)) return fulfill(route, { data: campaign });
    if (path.endsWith(`/campaigns/${ids.campaign}/asset-pool`))
      return fulfill(route, { data: { items: effectiveAssets } });
    if (path.endsWith(`/projects/${ids.project}`)) return fulfill(route, { data: project });
    if (path.endsWith(`/projects/${ids.project}/assets/effective`))
      return fulfill(route, { items: effectiveAssets });
    if (path.endsWith(`/projects/${ids.project}/assets`))
      return fulfill(route, {
        items: [
          {
            id: ids.projectAsset,
            assetVersionId: effectiveAssets[1]?.assetVersionId,
            roleCode: "BACKGROUND",
            createdAt: "2026-08-28T10:00:00.000Z",
          },
        ],
      });
    if (path.endsWith(`/projects/${ids.project}/asset-usages`))
      return fulfill(route, {
        items: [
          {
            id: "usage-1",
            assetVersionId: ids.assetVersion,
            creativeVersionId: ids.version,
            creativeId: ids.creative,
            creativeSetId: ids.set,
            projectId: ids.project,
          },
        ],
      });
    if (path.endsWith(`/projects/${ids.project}/creative-sets`))
      return fulfill(route, { items: [creativeSet] });
    if (path.endsWith(`/creative-sets/${ids.set}/creatives`))
      return fulfill(route, { items: creatives });
    if (path.includes("/creatives/") && !path.includes("creative-versions")) {
      const id = path.split("/").at(-1);
      return fulfill(route, { data: creatives.find((item) => item.id === id) ?? creatives[0] });
    }
    if (path.endsWith(`/creative-versions/${ids.version}/renders`))
      return fulfill(route, {
        items: [
          {
            id: "render-1",
            creativeVersionId: ids.version,
            renderPurpose: "PREVIEW",
            fileObjectId: "file-preview-1",
            status: "COMPLETED",
            createdAt: "2026-08-28T10:15:00.000Z",
          },
        ],
      });
    if (path.endsWith(`/creative-versions/${ids.version}/renders/render-1/download-url`)) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600"><defs><linearGradient id="g" x2="1"><stop stop-color="#11182d"/><stop offset="1" stop-color="#3158d4"/></linearGradient><linearGradient id="o"><stop stop-color="#ffc9b8"/><stop offset="1" stop-color="#819bff"/></linearGradient></defs><rect width="1200" height="600" fill="url(#g)"/><circle cx="950" cy="300" r="190" fill="url(#o)"/><text x="90" y="95" fill="white" font-family="Arial" font-size="20" font-weight="700" letter-spacing="4">GOBANOS</text><text x="90" y="260" fill="#cbd5ff" font-family="Arial" font-size="18" font-weight="700">AI FIRST DRAFT</text><text x="90" y="330" fill="white" font-family="Arial" font-size="55" font-weight="700">Designed for human final control.</text><text x="90" y="380" fill="white" opacity=".7" font-family="Arial" font-size="16">1200 × 600 · renderer PREVIEW</text></svg>`;
      return fulfill(route, {
        data: {
          url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
          expiresAt: "2026-08-28T11:00:00.000Z",
          filename: "renderer-preview.svg",
        },
      });
    }
    if (path.includes("/creative-versions/"))
      return fulfill(route, version(path.split("/").at(-1)));
    if (path.endsWith(`/campaigns/${ids.campaign}/channels`))
      return fulfill(route, {
        items: [{ id: "channel-1", channelCode: "KAKAO_MOMENT", status: "SELECTED" }],
      });
    if (path.endsWith(`/campaigns/${ids.campaign}/format-options`)) {
      const channelCode = url.searchParams.get("channelCode");
      return fulfill(route, {
        items:
          channelCode === "KAKAO_MOMENT"
            ? [
                {
                  id: "kakao-moment-bizboard-1029x258",
                  channelCode,
                  name: "Kakao Moment Bizboard 1029x258",
                  width: 1029,
                  height: 258,
                  status: "ACTIVE",
                },
                {
                  id: "kakao-moment-bizboard-thumbnail-box-right-1029x258",
                  channelCode,
                  name: "Bizboard Thumbnail Box Right",
                  width: 1029,
                  height: 258,
                  status: "ACTIVE",
                },
                {
                  id: "kakao-moment-display-native-2-1-1200x600",
                  channelCode,
                  name: "Display Native 2:1",
                  width: 1200,
                  height: 600,
                  status: "ACTIVE",
                },
              ]
            : [],
      });
    }
    if (path.endsWith(`/jobs/${ids.job}/items`))
      return fulfill(route, {
        items: [
          {
            id: "item-1",
            jobId: ids.job,
            itemKey: "product-morning:format-01",
            status: "COMPLETED",
            progressPercent: 100,
          },
          {
            id: "item-2",
            jobId: ids.job,
            itemKey: "product-morning:format-02",
            status: "RUNNING",
            progressPercent: 72,
          },
          {
            id: "item-3",
            jobId: ids.job,
            itemKey: "product-morning:format-03",
            status: "QUEUED",
            progressPercent: 0,
          },
        ],
      });
    if (path.endsWith(`/jobs/${ids.job}`))
      return fulfill(route, {
        data: {
          id: ids.job,
          jobType: "creative.generate",
          status: "RUNNING",
          progressPercent: 57,
          attemptNo: 1,
          maxAttempts: 3,
        },
      });
    return fulfill(
      route,
      {
        type: "about:blank",
        title: "Not Found",
        status: 404,
        code: "RESOURCE_NOT_FOUND",
        detail: `No PI-4C browser fixture for ${path}`,
      },
      404,
    );
  });
}

export function creativeSearch(extra: Record<string, string> = {}) {
  return new URLSearchParams({
    campaignId: ids.campaign,
    projectId: ids.project,
    productId: "product-morning",
    channel: "KAKAO_MOMENT",
    formats: "kakao-moment-bizboard-1029x258,kakao-moment-display-native-2-1-1200x600",
    formatSelectionIds: "selection-1,selection-3",
    ...extra,
  }).toString();
}
