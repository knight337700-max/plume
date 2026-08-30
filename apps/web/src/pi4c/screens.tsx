import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlumeBanner, PlumeButton, PlumeEmptyState, PlumeProgress } from "@plume/ui";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { apiClient, ApiError } from "../api/client";
import { queryKeys } from "../api/query-keys";
import {
  channelLabels,
  formatOptionId,
  formatOptionLabel,
  selectPrimaryRender,
  type AssetUsageRecord,
  type CampaignRecord,
  type CampaignFormatSelectionRecord,
  type ChannelSelectionRecord,
  type Collection,
  type CreativeRecord,
  type CreativeRenderRecord,
  type CreativeSetRecord,
  type CreativeVersionRecord,
  type DownloadUrlRecord,
  type EffectiveAssetRecord,
  type FormatOptionRecord,
  type JobItemRecord,
  type JobRecord,
  type ProjectAssetReferenceRecord,
  type ProjectRecord,
  type Resource,
} from "./contracts";
import { useTheme, type ThemePreference } from "./theme";

const canonicalChannels = ["KAKAO_MOMENT", "NAVER_GFA", "META", "GOOGLE_ADS"] as const;
const terminalJobStates = new Set([
  "SUCCEEDED",
  "COMPLETED",
  "FAILED",
  "CANCELED",
  "PARTIAL_SUCCESS",
]);

function apiMessage(error: unknown): string {
  return error instanceof ApiError
    ? `${error.problem.title}: ${error.problem.detail}`
    : "The server could not complete this request.";
}

function statusTone(status: string): string {
  const value = status.toUpperCase();
  if (
    ["ACTIVE", "READY", "GENERATED", "COMPLETED", "SUCCEEDED", "APPROVED", "PASS"].includes(value)
  )
    return "success";
  if (["FAILED", "ERROR", "BLOCKED", "INELIGIBLE"].includes(value)) return "danger";
  if (["QUEUED", "RUNNING", "GENERATING", "DRAFT", "PARTIAL_SUCCESS"].includes(value))
    return "info";
  return "neutral";
}

function StatusPill({ status }: { readonly status: string }) {
  return (
    <span className={`g-status g-status-${statusTone(status)}`}>
      <i aria-hidden="true" />
      {status.replaceAll("_", " ")}
    </span>
  );
}

function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  readonly eyebrow?: string;
  readonly title: string;
  readonly description: string;
  readonly actions?: ReactNode;
}) {
  return (
    <header className="g-page-header">
      <div>
        {eyebrow ? <div className="g-eyebrow">{eyebrow}</div> : null}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div className="g-page-actions">{actions}</div> : null}
    </header>
  );
}

function SectionHeader({
  title,
  description,
  action,
}: {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
}) {
  return (
    <header className="g-section-header">
      <div>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {action}
    </header>
  );
}

function QueryFailure({
  error,
  onRetry,
}: {
  readonly error: unknown;
  readonly onRetry?: () => void;
}) {
  return (
    <div className="g-callout g-callout-error" role="alert">
      <strong>We couldn’t load this section.</strong>
      <p>{apiMessage(error)}</p>
      {onRetry ? (
        <PlumeButton type="button" label="Try again" variant="secondary" onClick={onRetry} />
      ) : null}
    </div>
  );
}

function LoadingCards({ count = 3 }: { readonly count?: number }) {
  return (
    <div className="g-card-grid" aria-label="Loading" aria-busy="true">
      {Array.from({ length: count }, (_, index) => (
        <div className="g-card g-skeleton" key={index}>
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

function Empty({
  title,
  description,
  action,
}: {
  readonly title: string;
  readonly description: string;
  readonly action?: ReactNode;
}) {
  return (
    <div className="g-empty">
      <div className="g-empty-mark" aria-hidden="true">
        ◇
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

function metric(label: string, value: ReactNode, note: string) {
  return (
    <article className="g-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function useCampaigns(workspaceId: string) {
  return useQuery({
    queryKey: queryKeys.campaigns(workspaceId),
    queryFn: () =>
      apiClient.get<Collection<CampaignRecord>>(`/workspaces/${workspaceId}/campaigns`),
  });
}

function useProjects(workspaceId: string, campaignId: string | null) {
  return useQuery({
    queryKey: queryKeys.projects(workspaceId, campaignId ?? "none"),
    queryFn: () =>
      apiClient.get<Collection<ProjectRecord>>(
        `/workspaces/${workspaceId}/campaigns/${campaignId}/projects`,
      ),
    enabled: Boolean(campaignId),
  });
}

function useProject(workspaceId: string, projectId: string) {
  return useQuery({
    queryKey: queryKeys.project(workspaceId, projectId),
    queryFn: () =>
      apiClient.get<Resource<ProjectRecord>>(`/workspaces/${workspaceId}/projects/${projectId}`),
    enabled: Boolean(projectId),
  });
}

function useEffectiveAssets(workspaceId: string, projectId: string | null) {
  return useQuery({
    queryKey: queryKeys.projectAssets(workspaceId, projectId ?? "none", true),
    queryFn: () =>
      apiClient.get<Collection<EffectiveAssetRecord>>(
        `/workspaces/${workspaceId}/projects/${projectId}/assets/effective`,
      ),
    enabled: Boolean(projectId),
  });
}

export function WorkspaceEntryPage() {
  const [workspaceId, setWorkspaceId] = useState("");
  const navigate = useNavigate();
  function submit(event: FormEvent) {
    event.preventDefault();
    if (workspaceId.trim())
      navigate(`/w/${encodeURIComponent(workspaceId.trim())}/ai-creative/setup`);
  }
  return (
    <main className="g-entry">
      <div className="g-entry-panel">
        <div className="g-entry-kicker">GOBANOS CREATIVE OPERATING SYSTEM</div>
        <h1>Human judgment, amplified by AI.</h1>
        <p>
          Open an existing workspace to create campaign-ready assets with a durable, reviewable
          workflow.
        </p>
        <form onSubmit={submit}>
          <label htmlFor="workspace-id">Workspace ID</label>
          <input
            id="workspace-id"
            value={workspaceId}
            onChange={(event) => setWorkspaceId(event.target.value)}
            placeholder="Enter your workspace UUID"
            required
          />
          <PlumeButton type="submit" label="Open workspace" variant="primary" />
        </form>
      </div>
      <div className="g-entry-art" aria-hidden="true">
        <span>01</span>
        <span>Creative setup</span>
        <span>02</span>
        <span>Channel & format</span>
        <span>03</span>
        <span>AI generate</span>
        <span>04</span>
        <span>Human review</span>
      </div>
    </main>
  );
}

function workflowPath(workspaceId: string, step: string, search: URLSearchParams) {
  return `/w/${workspaceId}/ai-creative/${step}${search.size ? `?${search}` : ""}`;
}

function WorkflowNav({ active }: { readonly active: string }) {
  const { workspaceId = "" } = useParams();
  const [search] = useSearchParams();
  const steps = [
    ["setup", "Creative setup"],
    ["format", "Channel / format"],
    ["generate", "AI generate"],
    ["editor", "Creative editor"],
  ] as const;
  const activeIndex = Math.max(
    0,
    steps.findIndex(([id]) => id === active),
  );
  return (
    <nav className="g-workflow-nav" aria-label="AI Creative workflow">
      <ol>
        {steps.map(([id, label], index) => (
          <li
            key={id}
            className={
              index === activeIndex ? "is-current" : index < activeIndex ? "is-complete" : ""
            }
          >
            <Link
              to={workflowPath(workspaceId, id, search)}
              aria-current={index === activeIndex ? "step" : undefined}
            >
              <span>{index < activeIndex ? "✓" : index + 1}</span>
              <small>Step {index + 1}</small>
              <strong>{label}</strong>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function CreativeSetupPage() {
  const { workspaceId = "" } = useParams();
  const [search, setSearch] = useSearchParams();
  const campaignId = search.get("campaignId");
  const projectId = search.get("projectId");
  const campaigns = useCampaigns(workspaceId);
  const projects = useProjects(workspaceId, campaignId);
  const assets = useEffectiveAssets(workspaceId, projectId);
  const navigate = useNavigate();
  const eligible = assets.data?.items.filter((item) => item.eligible !== false) ?? [];
  const products = [
    ...new Set(
      eligible.map((item) => item.productId).filter((value): value is string => Boolean(value)),
    ),
  ];
  const productId = search.get("productId") ?? "";
  function update(key: string, value: string) {
    const next = new URLSearchParams(search);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === "campaignId") {
      next.delete("projectId");
      next.delete("productId");
    }
    if (key === "projectId") next.delete("productId");
    setSearch(next);
  }
  const ready = Boolean(campaignId && projectId && productId && eligible.length);
  return (
    <div data-screen-id="AI-01" className="g-screen">
      <WorkflowNav active="setup" />
      <PageHeader
        eyebrow="AI CREATIVE · STEP 1"
        title="Build the creative foundation"
        description="Bind this draft to a Campaign and Project, then review the server-resolved effective Asset Pool."
      />
      <div className="g-two-column">
        <section className="g-card g-form-card">
          <SectionHeader
            title="Creative context"
            description="Account → Campaign → Project remains explicit throughout generation."
          />
          <div className="g-field-row">
            <label>
              <span>Campaign</span>
              <select
                value={campaignId ?? ""}
                onChange={(event) => update("campaignId", event.target.value)}
              >
                <option value="">Select a campaign</option>
                {campaigns.data?.items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Project</span>
              <select
                value={projectId ?? ""}
                disabled={!campaignId || projects.isLoading}
                onChange={(event) => update("projectId", event.target.value)}
              >
                <option value="">Select a project</option>
                {projects.data?.items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="g-field">
            <span>Product</span>
            <select
              value={productId}
              disabled={!projectId || !products.length}
              onChange={(event) => update("productId", event.target.value)}
            >
              <option value="">Select a product represented in the effective pool</option>
              {products.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
          <div className="g-callout">
            <strong>Copy comes from the confirmed Campaign brief</strong>
            <p>
              No contract-backed pre-generation manual-copy field or AI Copywriter request exists.
              Gobanos does not claim unsupported local text will affect generation.
            </p>
          </div>
          <div className="g-readiness">
            <span className={campaignId ? "is-ready" : ""}>Campaign</span>
            <span className={projectId ? "is-ready" : ""}>Project</span>
            <span className={productId ? "is-ready" : ""}>Product</span>
            <span className={eligible.length ? "is-ready" : ""}>Eligible assets</span>
          </div>
        </section>
        <aside className="g-card">
          <SectionHeader
            title="Effective Asset Pool"
            description="Frozen server-side from Campaign inheritance and Project-local references."
          />
          {assets.isLoading ? (
            <LoadingCards count={2} />
          ) : assets.isError ? (
            <QueryFailure error={assets.error} onRetry={() => void assets.refetch()} />
          ) : eligible.length ? (
            <div className="g-asset-list">
              {eligible.map((asset) => (
                <article key={`${asset.assetVersionId}-${asset.roleCode}`} className="g-asset-row">
                  <div className="g-asset-thumb" aria-hidden="true">
                    {asset.roleCode?.slice(0, 1) ?? "A"}
                  </div>
                  <div>
                    <strong>{asset.name ?? `Asset ${asset.assetVersionId.slice(0, 8)}`}</strong>
                    <span>
                      {asset.roleCode ?? "Legacy role absent"} · {asset.source ?? "PROJECT"}
                    </span>
                  </div>
                  <StatusPill status={asset.eligible === false ? "INELIGIBLE" : "READY"} />
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title={projectId ? "No eligible assets" : "Choose a Project"}
              description={
                projectId
                  ? "Add an eligible Campaign or Project asset before generation."
                  : "The effective pool is resolved only after an explicit Project selection."
              }
            />
          )}
          {products.length ? (
            <p className="g-footnote">Products represented: {products.length}</p>
          ) : null}
        </aside>
      </div>
      <div className="g-sticky-action">
        <div>
          <strong>{ready ? "Setup is ready" : "Complete the setup"}</strong>
          <span>
            {ready
              ? `${eligible.length} eligible assets will be frozen by the server.`
              : "Campaign, Project, product, and eligible assets are required."}
          </span>
        </div>
        <PlumeButton
          type="button"
          label="Continue to formats"
          variant="primary"
          isDisabled={!ready}
          disabledReason="Complete all required setup fields first."
          onClick={() => navigate(workflowPath(workspaceId, "format", search))}
        />
      </div>
    </div>
  );
}

export function ChannelFormatPage() {
  const { workspaceId = "" } = useParams();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const campaignId = search.get("campaignId") ?? "";
  const [channel, setChannel] = useState(search.get("channel") ?? "KAKAO_MOMENT");
  const selected = new Set((search.get("formats") ?? "").split(",").filter(Boolean));
  const channels = useQuery({
    queryKey: queryKeys.channels(workspaceId, campaignId),
    queryFn: () =>
      apiClient.get<Collection<ChannelSelectionRecord>>(
        `/workspaces/${workspaceId}/campaigns/${campaignId}/channels`,
      ),
    enabled: Boolean(campaignId),
  });
  const formatQueries = useQueries({
    queries: canonicalChannels.map((channelCode) => ({
      queryKey: queryKeys.formatOptions(workspaceId, campaignId, channelCode),
      queryFn: () =>
        apiClient.get<Collection<FormatOptionRecord>>(
          `/workspaces/${workspaceId}/campaigns/${campaignId}/format-options?channelCode=${channelCode}`,
        ),
      enabled: Boolean(campaignId),
    })),
  });
  const formats =
    formatQueries[canonicalChannels.indexOf(channel as (typeof canonicalChannels)[number])];
  const persistSelection = useMutation({
    mutationFn: async () => {
      await apiClient.put<Collection<ChannelSelectionRecord>>(
        `/workspaces/${workspaceId}/campaigns/${campaignId}/channels`,
        { items: [{ channelCode: channel }] },
      );
      return apiClient.put<Collection<CampaignFormatSelectionRecord>>(
        `/workspaces/${workspaceId}/campaigns/${campaignId}/format-selections`,
        {
          items: [...selected].map((formatProfileId) => ({
            channelCode: channel,
            formatProfileId,
          })),
        },
      );
    },
    onSuccess(result) {
      const next = new URLSearchParams(search);
      next.set("formatSelectionIds", result.items.map((item) => item.id).join(","));
      navigate(workflowPath(workspaceId, "generate", next));
    },
  });
  function chooseChannel(value: string) {
    setChannel(value);
    const next = new URLSearchParams(search);
    next.set("channel", value);
    next.delete("formats");
    setSearch(next);
  }
  function toggleFormat(id: string) {
    const nextSelected = new Set(selected);
    if (nextSelected.has(id)) nextSelected.delete(id);
    else nextSelected.add(id);
    const next = new URLSearchParams(search);
    next.set("channel", channel);
    if (nextSelected.size) next.set("formats", [...nextSelected].join(","));
    else next.delete("formats");
    setSearch(next);
  }
  const options = formats?.data?.items ?? [];
  return (
    <div data-screen-id="AI-02" className="g-screen">
      <WorkflowNav active="format" />
      <PageHeader
        eyebrow="AI CREATIVE · STEP 2"
        title="Choose channels and formats"
        description="Only catalog-backed profiles can be selected. Unavailable channels remain visible and fail closed."
      />
      {!campaignId ? (
        <div className="g-callout g-callout-warning">
          <strong>Campaign context required</strong>
          <p>Return to Creative Setup and choose a Campaign and Project.</p>
        </div>
      ) : null}
      <section className="g-card">
        <SectionHeader
          title="Canonical channels"
          description="Availability is read from the current catalog—not inferred by the UI."
        />
        <div className="g-channel-grid" role="tablist" aria-label="Channels">
          {canonicalChannels.map((code) => {
            const activeCount =
              formatQueries[canonicalChannels.indexOf(code)]?.data?.items.filter(
                (item) => item.status === "ACTIVE",
              ).length ?? 0;
            return (
              <button
                key={code}
                type="button"
                role="tab"
                aria-selected={channel === code}
                className={channel === code ? "g-channel is-selected" : "g-channel"}
                onClick={() => chooseChannel(code)}
              >
                <span className="g-channel-logo" aria-hidden="true">
                  {channelLabels[code]?.slice(0, 1)}
                </span>
                <strong>{channelLabels[code]}</strong>
                <small>
                  {activeCount ? `${activeCount} approved formats` : "Catalog not ready"}
                </small>
              </button>
            );
          })}
        </div>
      </section>
      <section className="g-card">
        <SectionHeader
          title={`${channelLabels[channel] ?? channel} formats`}
          description={
            options.length
              ? "Select one or more targets for multi-format generation."
              : "No approved format profile exists for this channel."
          }
          action={<span className="g-selection-count">{selected.size} selected</span>}
        />
        {formats?.isLoading ? (
          <LoadingCards />
        ) : formats?.isError ? (
          <QueryFailure error={formats.error} onRetry={() => void formats.refetch()} />
        ) : options.length ? (
          <div className="g-format-grid">
            {options.map((option) => {
              const id = formatOptionId(option);
              const active = option.status === "ACTIVE";
              const picked = selected.has(id);
              return (
                <button
                  type="button"
                  key={id}
                  className={`g-format-card${picked ? " is-selected" : ""}`}
                  aria-pressed={picked}
                  disabled={!active}
                  onClick={() => toggleFormat(id)}
                >
                  <span className="g-format-check" aria-hidden="true">
                    {picked ? "✓" : active ? "+" : "×"}
                  </span>
                  <strong>{formatOptionLabel(option)}</strong>
                  <span>{option.channelCode}</span>
                  <StatusPill status={active ? "ACTIVE" : (option.status ?? "UNAVAILABLE")} />
                  {!active ? (
                    <small>{option.reason ?? "This profile is not selectable."}</small>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : (
          <Empty
            title="Catalog not ready"
            description="No fabricated format options are shown. Choose Kakao Moment to use the current approved profiles."
          />
        )}
      </section>
      <div className="g-sticky-action">
        <div>
          <strong>
            {selected.size
              ? `${selected.size} target${selected.size > 1 ? "s" : ""} selected`
              : "Select at least one format"}
          </strong>
          <span>
            Each selection is resolved to an exact durable Campaign Format Selection before enqueue.
          </span>
        </div>
        <div className="g-action-row">
          <PlumeButton
            type="button"
            label="Back"
            variant="secondary"
            onClick={() => navigate(workflowPath(workspaceId, "setup", search))}
          />
          <PlumeButton
            type="button"
            label="Review generation"
            variant="primary"
            isDisabled={!selected.size || persistSelection.isPending}
            disabledReason="Select an active catalog format first."
            onClick={() => persistSelection.mutate()}
          />
        </div>
      </div>
      {persistSelection.isError ? <QueryFailure error={persistSelection.error} /> : null}
    </div>
  );
}

export function GeneratePage() {
  const { workspaceId = "" } = useParams();
  const [search, setSearch] = useSearchParams();
  const queryClient = useQueryClient();
  const campaignId = search.get("campaignId") ?? "";
  const projectId = search.get("projectId") ?? "";
  const formatIds = (search.get("formatSelectionIds") ?? "").split(",").filter(Boolean);
  const jobId = search.get("jobId");
  const assets = useEffectiveAssets(workspaceId, projectId);
  const job = useQuery({
    queryKey: queryKeys.job(workspaceId, jobId ?? "none"),
    queryFn: () => apiClient.get<Resource<JobRecord>>(`/workspaces/${workspaceId}/jobs/${jobId}`),
    enabled: Boolean(jobId),
    refetchInterval: (query) =>
      terminalJobStates.has(query.state.data?.data.status ?? "") ? false : 2500,
  });
  const items = useQuery({
    queryKey: [...queryKeys.job(workspaceId, jobId ?? "none"), "items"],
    queryFn: () =>
      apiClient.get<Collection<JobItemRecord>>(`/workspaces/${workspaceId}/jobs/${jobId}/items`),
    enabled: Boolean(jobId),
    refetchInterval: jobId && !terminalJobStates.has(job.data?.data.status ?? "") ? 2500 : false,
  });
  const selectedProductId = search.get("productId");
  const productIds = selectedProductId
    ? [selectedProductId]
    : [
        ...new Set(
          (assets.data?.items ?? [])
            .map((item) => item.productId)
            .filter((value): value is string => Boolean(value)),
        ),
      ];
  const start = useMutation({
    mutationFn: () =>
      apiClient.post<{ readonly job: { readonly id: string; readonly status: string } }>(
        `/workspaces/${workspaceId}/campaigns/${campaignId}/generation-requests`,
        {
          projectId,
          productIds,
          formatSelectionIds: formatIds,
          variantCountPerProduct: 1,
          generationMode: "CANONICAL_RENDERER",
        },
        { headers: { "Idempotency-Key": crypto.randomUUID() } },
      ),
    onSuccess(result) {
      const next = new URLSearchParams(search);
      next.set("jobId", result.job.id);
      setSearch(next, { replace: true });
    },
  });
  const retry = useMutation({
    mutationFn: () =>
      apiClient.post<{ readonly job: { readonly id: string } }>(
        `/workspaces/${workspaceId}/jobs/${jobId}.retry`,
        {},
      ),
    onSuccess(result) {
      const next = new URLSearchParams(search);
      next.set("jobId", result.job.id);
      setSearch(next, { replace: true });
    },
  });
  const cancel = useMutation({
    mutationFn: () => apiClient.post(`/workspaces/${workspaceId}/jobs/${jobId}.cancel`, {}),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: queryKeys.job(workspaceId, jobId ?? "") }),
  });
  const current = job.data?.data;
  const completed =
    items.data?.items.filter((item) => ["SUCCEEDED", "COMPLETED"].includes(item.status)).length ??
    0;
  const canContinue =
    current && ["SUCCEEDED", "COMPLETED", "PARTIAL_SUCCESS"].includes(current.status);
  return (
    <div data-screen-id="AI-03" className="g-screen">
      <WorkflowNav active="generate" />
      <PageHeader
        eyebrow="AI CREATIVE · STEP 3"
        title={jobId ? "Generation in progress" : "Review and generate"}
        description="The server freezes Project context before a durable creative.generate command enters the worker pipeline."
        actions={jobId ? <StatusPill status={current?.status ?? "LOADING"} /> : undefined}
      />
      {!jobId ? (
        <div className="g-two-column">
          <section className="g-card">
            <SectionHeader
              title="Generation matrix"
              description="Confirm scope before creating the durable job."
            />
            <dl className="g-summary-list">
              <div>
                <dt>Campaign</dt>
                <dd>{campaignId || "Missing"}</dd>
              </div>
              <div>
                <dt>Project</dt>
                <dd>{projectId || "Missing"}</dd>
              </div>
              <div>
                <dt>Products</dt>
                <dd>{productIds.length || "Derived by server"}</dd>
              </div>
              <div>
                <dt>Format targets</dt>
                <dd>{formatIds.length}</dd>
              </div>
              <div>
                <dt>Expected output</dt>
                <dd>{Math.max(1, productIds.length) * formatIds.length} creative drafts</dd>
              </div>
            </dl>
            <div className="g-callout">
              <strong>Immutable snapshot</strong>
              <p>
                The browser sends only IDs. Effective Campaign and Project assets are resolved and
                frozen server-side before enqueue.
              </p>
            </div>
          </section>
          <aside className="g-card">
            <SectionHeader title="Selected targets" />
            {formatIds.length ? (
              <ul className="g-check-list">
                {formatIds.map((id) => (
                  <li key={id}>
                    <span aria-hidden="true">✓</span>
                    {id}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty
                title="No formats selected"
                description="Return to Step 2 and select an active format."
              />
            )}
          </aside>
        </div>
      ) : (
        <section className="g-card g-job-panel" aria-live="polite">
          <SectionHeader
            title="Durable job"
            description={`Job ${jobId}`}
            action={current ? <strong>{Math.round(current.progressPercent)}%</strong> : null}
          />
          {job.isError ? (
            <QueryFailure error={job.error} onRetry={() => void job.refetch()} />
          ) : (
            <>
              <PlumeProgress
                label="Creative generation progress"
                value={current?.progressPercent ?? 0}
                max={100}
              />
              <p className="g-live-copy">
                {current
                  ? `${current.status.replaceAll("_", " ")} · attempt ${current.attemptNo} of ${current.maxAttempts}`
                  : "Recovering the latest server status…"}
              </p>
              <div className="g-job-items">
                {items.data?.items.map((item) => (
                  <article key={item.id}>
                    <span className="g-job-index" aria-hidden="true">
                      {item.itemKey.slice(-2)}
                    </span>
                    <div>
                      <strong>{item.itemKey}</strong>
                      <small>{item.status.replaceAll("_", " ")}</small>
                    </div>
                    <span>{Math.round(item.progressPercent)}%</span>
                  </article>
                ))}
              </div>
              {items.data?.items.length ? (
                <p className="g-footnote">
                  {completed} of {items.data.items.length} items completed. Recovery reconciles this
                  view with GET job/items.
                </p>
              ) : null}
            </>
          )}
        </section>
      )}
      {start.isError || retry.isError || cancel.isError ? (
        <PlumeBanner
          status="error"
          title="Generation action failed"
          description={apiMessage(start.error ?? retry.error ?? cancel.error)}
        />
      ) : null}
      <div className="g-sticky-action">
        <div>
          <strong>
            {jobId
              ? canContinue
                ? "Drafts are ready for human review"
                : "Generation state is durable"
              : "Ready to enqueue"}
          </strong>
          <span>
            {jobId
              ? "You may leave and return using this job ID without losing progress."
              : "Retry applies to the entire job; per-item retry is not supported."}
          </span>
        </div>
        <div className="g-action-row">
          {!jobId ? (
            <PlumeButton
              type="button"
              label={start.isPending ? "Starting…" : "Start generation"}
              variant="primary"
              isDisabled={start.isPending || !campaignId || !projectId || !formatIds.length}
              onClick={() => start.mutate()}
            />
          ) : (
            <>
              {current && ["QUEUED", "RUNNING"].includes(current.status) ? (
                <PlumeButton
                  type="button"
                  label="Cancel job"
                  variant="secondary"
                  onClick={() => cancel.mutate()}
                />
              ) : null}
              {current && ["FAILED", "PARTIAL_SUCCESS"].includes(current.status) ? (
                <PlumeButton
                  type="button"
                  label="Retry job"
                  variant="secondary"
                  onClick={() => retry.mutate()}
                />
              ) : null}
              <PlumeButton
                type="button"
                label="Refresh status"
                variant="ghost"
                onClick={() => {
                  void job.refetch();
                  void items.refetch();
                }}
              />
              <PlumeButton
                type="button"
                label="Continue to editor"
                variant="primary"
                isDisabled={!canContinue}
                disabledReason="At least one generated creative is required."
                onClick={() => {
                  const next = new URLSearchParams(search);
                  window.location.assign(workflowPath(workspaceId, "editor", next));
                }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CreativePreview({
  version,
  url,
  filename,
}: {
  readonly version: CreativeVersionRecord;
  readonly url: string;
  readonly filename: string;
}) {
  const [artifactState, setArtifactState] = useState<"loading" | "loaded" | "failed">("loading");
  useEffect(() => setArtifactState("loading"), [url]);
  return (
    <div className="g-artboard-wrap" data-artifact-state={artifactState}>
      {artifactState === "loading" ? (
        <div className="g-canvas-loading" role="status">
          Loading renderer artifact bytes…
        </div>
      ) : null}
      {artifactState === "failed" ? (
        <div className="g-artifact-failure" role="alert">
          <strong>Renderer artifact failed to load</strong>
          <span>The durable render exists, but its scoped download could not be decoded.</span>
        </div>
      ) : null}
      <img
        className="g-render-artifact"
        src={url}
        alt={`Renderer preview: ${filename} · ${version.formatProfileId}`}
        hidden={artifactState !== "loaded"}
        onLoad={() => setArtifactState("loaded")}
        onError={() => setArtifactState("failed")}
      />
    </div>
  );
}

export function EditorPage() {
  const { workspaceId = "" } = useParams();
  const [search, setSearch] = useSearchParams();
  const projectId = search.get("projectId") ?? "";
  const sets = useQuery({
    queryKey: queryKeys.projectCreativeSets(workspaceId, projectId),
    queryFn: () =>
      apiClient.get<Collection<CreativeSetRecord>>(
        `/workspaces/${workspaceId}/projects/${projectId}/creative-sets`,
      ),
    enabled: Boolean(projectId),
  });
  const selectedSetId = search.get("creativeSetId") ?? sets.data?.items[0]?.id ?? "";
  const creatives = useQuery({
    queryKey: queryKeys.creatives(workspaceId, selectedSetId),
    queryFn: () =>
      apiClient.get<Collection<CreativeRecord>>(
        `/workspaces/${workspaceId}/creative-sets/${selectedSetId}/creatives`,
      ),
    enabled: Boolean(selectedSetId),
  });
  const selectedCreativeId = search.get("creativeId") ?? creatives.data?.items[0]?.id ?? "";
  const creative = useQuery({
    queryKey: queryKeys.creative(workspaceId, selectedCreativeId),
    queryFn: () =>
      apiClient.get<Resource<CreativeRecord>>(
        `/workspaces/${workspaceId}/creatives/${selectedCreativeId}`,
      ),
    enabled: Boolean(selectedCreativeId),
  });
  const versionId = creative.data?.data.currentVersionId ?? "";
  const version = useQuery({
    queryKey: queryKeys.creativeVersion(workspaceId, versionId),
    queryFn: () =>
      apiClient.get<Resource<CreativeVersionRecord>>(
        `/workspaces/${workspaceId}/creative-versions/${versionId}`,
      ),
    enabled: Boolean(versionId),
  });
  const renders = useQuery({
    queryKey: queryKeys.creativeRenders(workspaceId, versionId),
    queryFn: () =>
      apiClient.get<Collection<CreativeRenderRecord>>(
        `/workspaces/${workspaceId}/creative-versions/${versionId}/renders`,
      ),
    enabled: Boolean(versionId),
  });
  const completedRender = selectPrimaryRender(renders.data?.items ?? []);
  const failedRender = renders.data?.items.find((item) => item.status === "FAILED");
  const download = useQuery({
    queryKey: queryKeys.creativeRenderDownload(
      workspaceId,
      versionId,
      completedRender?.id ?? "none",
    ),
    queryFn: () =>
      apiClient.get<Resource<DownloadUrlRecord>>(
        `/workspaces/${workspaceId}/creative-versions/${versionId}/renders/${completedRender?.id}/download-url`,
      ),
    enabled: Boolean(versionId && completedRender?.id),
  });
  const [zoom, setZoom] = useState(80);
  const [panel, setPanel] = useState<"layers" | "properties" | "validation">("layers");
  function selectCreative(id: string) {
    const next = new URLSearchParams(search);
    next.set("creativeId", id);
    setSearch(next, { replace: true });
  }
  const current = version.data?.data;
  const elements = Array.isArray(current?.documentJson.elements)
    ? current.documentJson.elements
    : [];
  if (!projectId)
    return (
      <div className="g-screen">
        <WorkflowNav active="editor" />
        <Empty
          title="Project context required"
          description="Open the editor from a Project creative collection."
        />
      </div>
    );
  return (
    <div data-screen-id="AI-04" className="g-editor-page">
      <WorkflowNav active="editor" />
      <div className="g-editor-heading">
        <div>
          <span>AI CREATIVE · STEP 4</span>
          <h1>Creative editor</h1>
        </div>
        <div className="g-action-row">
          <StatusPill status={current?.status ?? "LOADING"} />
          <PlumeButton
            type="button"
            label="Validate"
            variant="secondary"
            className="g-deferred-action"
            isDisabled
            disabledReason="Durable validation actions are not available in PI-4C."
          />
          <PlumeButton
            type="button"
            label="Finalize"
            variant="secondary"
            className="g-deferred-action"
            isDisabled
            disabledReason="Finalize requires durable validation and approval readiness."
          />
        </div>
      </div>
      <div className="g-editor-shell">
        <aside className="g-editor-list" aria-label="Creative List">
          <header>
            <strong>Creative List</strong>
            <span>{creatives.data?.items.length ?? 0}</span>
          </header>
          {creatives.isLoading ? (
            <LoadingCards count={2} />
          ) : creatives.data?.items.length ? (
            <ul>
              {creatives.data.items.map((item, index) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={item.id === selectedCreativeId ? "is-selected" : ""}
                    onClick={() => selectCreative(item.id)}
                  >
                    <span className="g-mini-preview" aria-hidden="true">
                      {index + 1}
                    </span>
                    <span>
                      <strong>Creative {index + 1}</strong>
                      <small>{item.status.replaceAll("_", " ")}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty
              title="No generated creatives"
              description="Return to Generate and complete at least one item."
            />
          )}
        </aside>
        <section className="g-canvas-region" aria-label="Canvas workspace">
          <div className="g-canvas-toolbar">
            <span>Renderer preview</span>
            <div>
              <button
                type="button"
                onClick={() => setZoom(Math.max(25, zoom - 10))}
                aria-label="Zoom out"
              >
                −
              </button>
              <output aria-label="Canvas zoom">{zoom}%</output>
              <button
                type="button"
                onClick={() => setZoom(Math.min(200, zoom + 10))}
                aria-label="Zoom in"
              >
                +
              </button>
              <button type="button" onClick={() => setZoom(80)}>
                Fit
              </button>
            </div>
          </div>
          <div
            className="g-canvas-stage"
            style={{ "--preview-scale": zoom / 100 } as React.CSSProperties}
          >
            {!versionId ? (
              <Empty
                title="No current version"
                description="The durable Creative.currentVersionId pointer did not resolve. The editor fails closed."
              />
            ) : version.isLoading ? (
              <div className="g-canvas-loading" role="status">
                Loading durable current version…
              </div>
            ) : version.isError ? (
              <QueryFailure error={version.error} onRetry={() => void version.refetch()} />
            ) : renders.isLoading ? (
              <div className="g-canvas-loading" role="status">
                Loading renderer outcomes…
              </div>
            ) : renders.isError ? (
              <QueryFailure error={renders.error} onRetry={() => void renders.refetch()} />
            ) : !completedRender ? (
              <Empty
                title={failedRender ? "Renderer preview failed" : "No completed renderer preview"}
                description={
                  failedRender
                    ? "The renderer outcome failed. Validation status is tracked separately and is not inferred from this failure."
                    : "The UI does not synthesize final pixels. Request a renderer PREVIEW to populate this canvas."
                }
              />
            ) : download.isLoading ? (
              <div className="g-canvas-loading" role="status">
                Authorizing scoped artifact download…
              </div>
            ) : download.isError ? (
              <QueryFailure error={download.error} onRetry={() => void download.refetch()} />
            ) : current && download.data ? (
              <CreativePreview
                version={current}
                url={download.data.data.url}
                filename={download.data.data.filename}
              />
            ) : (
              <Empty
                title="Artifact unavailable"
                description="The durable render download contract returned no artifact."
              />
            )}
          </div>
        </section>
        <aside className="g-inspector" aria-label="Inspector">
          <div className="g-inspector-tabs" role="tablist" aria-label="Inspector panels">
            {(["layers", "properties", "validation"] as const).map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={panel === id}
                onClick={() => setPanel(id)}
              >
                {id[0]?.toUpperCase()}
                {id.slice(1)}
              </button>
            ))}
          </div>
          <div className="g-inspector-body">
            {panel === "layers" ? (
              <>
                <SectionHeader
                  title="Layers"
                  description="Read-only canonical document structure."
                />
                {elements.length ? (
                  <ol className="g-layer-list">
                    {elements.map((element, index) => (
                      <li key={String(element.id ?? index)}>
                        <span aria-hidden="true">◇</span>
                        <div>
                          <strong>
                            {String(element.name ?? element.type ?? `Layer ${index + 1}`)}
                          </strong>
                          <small>{String(element.type ?? "element")}</small>
                        </div>
                        <span>⌁</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <Empty
                    title="No layer metadata"
                    description="The current renderer document has no exposed elements."
                  />
                )}
              </>
            ) : panel === "properties" ? (
              <>
                <SectionHeader
                  title="Document properties"
                  description="Advanced editing begins in PI-4D."
                />
                <dl className="g-property-list">
                  <div>
                    <dt>Version</dt>
                    <dd>{current ? `v${current.versionNo}` : "—"}</dd>
                  </div>
                  <div>
                    <dt>Format profile</dt>
                    <dd>{current?.formatProfileId ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Revision</dt>
                    <dd>{current?.revisionNo ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Current pointer</dt>
                    <dd>{versionId ? "Resolved" : "Missing"}</dd>
                  </div>
                </dl>
              </>
            ) : (
              <>
                <SectionHeader
                  title="Validation"
                  description="Renderer remains geometry and validation authority."
                />
                <div className="g-validation-summary">
                  <span aria-hidden="true">—</span>
                  <strong>Validation not run</strong>
                  <p>
                    A durable validation projection is not exposed by this Gate. The UI does not
                    infer PASS from render completion or browser geometry.
                  </p>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>
      <footer className="g-editor-status" aria-live="polite">
        <span>
          <i aria-hidden="true" /> Current durable version{" "}
          {versionId ? versionId.slice(0, 8) : "unresolved"}
        </span>
        <span>
          {completedRender
            ? `${completedRender.renderPurpose.replaceAll("_", " ")} · renderer pixels`
            : "No renderer artifact selected"}
        </span>
      </footer>
      <div className="g-limited-editor" role="status">
        <strong>Limited editor mode</strong>
        <span>
          Preview, creative selection, and validation status remain available below 1024 px. Use a
          wider viewport for full editing tools.
        </span>
      </div>
    </div>
  );
}

function ProjectCreativeCard({
  workspaceId,
  projectId,
  set,
  creative,
}: {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly set: CreativeSetRecord;
  readonly creative: CreativeRecord;
}) {
  const versionId = creative.currentVersionId ?? "";
  const version = useQuery({
    queryKey: queryKeys.creativeVersion(workspaceId, versionId),
    queryFn: () =>
      apiClient.get<Resource<CreativeVersionRecord>>(
        `/workspaces/${workspaceId}/creative-versions/${versionId}`,
      ),
    enabled: Boolean(versionId),
  });
  const renders = useQuery({
    queryKey: queryKeys.creativeRenders(workspaceId, versionId),
    queryFn: () =>
      apiClient.get<Collection<CreativeRenderRecord>>(
        `/workspaces/${workspaceId}/creative-versions/${versionId}/renders`,
      ),
    enabled: Boolean(versionId),
  });
  const primaryRender = selectPrimaryRender(renders.data?.items ?? []);
  const download = useQuery({
    queryKey: queryKeys.creativeRenderDownload(workspaceId, versionId, primaryRender?.id ?? "none"),
    queryFn: () =>
      apiClient.get<Resource<DownloadUrlRecord>>(
        `/workspaces/${workspaceId}/creative-versions/${versionId}/renders/${primaryRender?.id}/download-url`,
      ),
    enabled: Boolean(versionId && primaryRender),
  });
  const editorSearch = new URLSearchParams({
    projectId,
    creativeSetId: set.id,
    creativeId: creative.id,
  });
  const current = version.data?.data;
  const width = current?.documentJson.width;
  const height = current?.documentJson.height;
  const previewLoading = version.isLoading || renders.isLoading || download.isLoading;
  return (
    <article className="g-creative-card">
      <div className="g-creative-visual g-durable-creative-preview">
        {previewLoading ? (
          <span role="status">Loading renderer preview…</span>
        ) : version.isError || renders.isError || download.isError ? (
          <span role="alert">Preview unavailable</span>
        ) : current && download.data ? (
          <CreativePreview
            version={current}
            url={download.data.data.url}
            filename={download.data.data.filename}
          />
        ) : (
          <span>No completed renderer preview</span>
        )}
      </div>
      <div className="g-creative-copy">
        <span>{set.name}</span>
        <h2>Creative {creative.id.slice(0, 8)}</h2>
        <p>
          {current?.formatProfileId ?? "Current format unresolved"}
          {width && height ? ` · ${width} × ${height}` : ""}
        </p>
        <div>
          <StatusPill status={creative.status} />
          <span>Current v. {versionId ? "resolved" : "missing"}</span>
        </div>
        <Link
          className="g-primary-link"
          to={`/w/${workspaceId}/ai-creative/editor?${editorSearch}`}
        >
          Open editor
        </Link>
      </div>
    </article>
  );
}

export function CampaignIndexPage() {
  const { workspaceId = "" } = useParams();
  const campaigns = useCampaigns(workspaceId);
  return (
    <div className="g-screen">
      <PageHeader
        eyebrow="CAMPAIGN / PROJECT"
        title="Campaigns"
        description="Choose a Campaign to inspect its assets, Projects, and creative workflow."
        actions={
          <Link className="g-text-link" to={`/w/${workspaceId}/ai-creative/setup`}>
            Start AI Creative →
          </Link>
        }
      />
      {campaigns.isLoading ? (
        <LoadingCards />
      ) : campaigns.isError ? (
        <QueryFailure error={campaigns.error} onRetry={() => void campaigns.refetch()} />
      ) : campaigns.data?.items.length ? (
        <div className="g-card-grid">
          {campaigns.data.items.map((campaign) => (
            <Link
              className="g-card g-link-card"
              key={campaign.id}
              to={`/w/${workspaceId}/campaigns/${campaign.id}`}
            >
              <span className="g-card-index">{campaign.displayCode ?? "CAMPAIGN"}</span>
              <h2>{campaign.name}</h2>
              <p>{campaign.objectiveCode ?? "General creative campaign"}</p>
              <StatusPill status={campaign.status} />
              <span className="g-arrow">→</span>
            </Link>
          ))}
        </div>
      ) : (
        <Empty
          title="No Campaigns yet"
          description="Campaign creation remains available through the current contract-backed workflow."
        />
      )}
    </div>
  );
}

function CampaignTabs({
  workspaceId,
  campaignId,
  active,
}: {
  readonly workspaceId: string;
  readonly campaignId: string;
  readonly active: "overview" | "assets" | "projects";
}) {
  return (
    <nav className="g-tabs" aria-label="Campaign sections">
      <NavTab active={active === "overview"} to={`/w/${workspaceId}/campaigns/${campaignId}`}>
        Overview
      </NavTab>
      <NavTab active={active === "assets"} to={`/w/${workspaceId}/campaigns/${campaignId}/assets`}>
        Assets
      </NavTab>
      <NavTab
        active={active === "projects"}
        to={`/w/${workspaceId}/campaigns/${campaignId}/projects`}
      >
        Projects
      </NavTab>
    </nav>
  );
}

function ProjectTabs({
  workspaceId,
  campaignId,
  projectId,
  active,
}: {
  readonly workspaceId: string;
  readonly campaignId: string | undefined;
  readonly projectId: string;
  readonly active: "overview" | "assets" | "creatives";
}) {
  const base = campaignId
    ? `/w/${workspaceId}/campaigns/${campaignId}/projects/${projectId}`
    : `/w/${workspaceId}/projects/${projectId}`;
  return (
    <nav className="g-tabs" aria-label="Project sections">
      <NavTab active={active === "overview"} to={base}>
        Overview
      </NavTab>
      <NavTab active={active === "assets"} to={`${base}/assets`}>
        Assets
      </NavTab>
      <NavTab active={active === "creatives"} to={`${base}/creatives`}>
        Creatives
      </NavTab>
    </nav>
  );
}

function NavTab({
  to,
  active,
  children,
}: {
  readonly to: string;
  readonly active: boolean;
  readonly children: ReactNode;
}) {
  return (
    <Link to={to} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined}>
      {children}
    </Link>
  );
}

export function CampaignOverviewPage() {
  const { workspaceId = "", campaignId = "" } = useParams();
  const campaign = useQuery({
    queryKey: queryKeys.campaign(workspaceId, campaignId),
    queryFn: () =>
      apiClient.get<Resource<CampaignRecord>>(`/workspaces/${workspaceId}/campaigns/${campaignId}`),
  });
  const projects = useProjects(workspaceId, campaignId);
  const assets = useQuery({
    queryKey: queryKeys.campaignAssets(workspaceId, campaignId),
    queryFn: () =>
      apiClient.get<
        Resource<{
          readonly selections?: readonly EffectiveAssetRecord[];
          readonly items?: readonly EffectiveAssetRecord[];
        }>
      >(`/workspaces/${workspaceId}/campaigns/${campaignId}/asset-pool`),
  });
  const item = campaign.data?.data;
  const assetCount = assets.data?.data.items?.length ?? assets.data?.data.selections?.length ?? 0;
  return (
    <div data-screen-id="CAMPAIGN-01" className="g-screen">
      <PageHeader
        eyebrow={item?.displayCode ?? "CAMPAIGN"}
        title={item?.name ?? "Campaign overview"}
        description="Campaign context, inherited assets, and Projects in one contract-backed view."
        actions={
          <Link
            className="g-primary-link"
            to={`/w/${workspaceId}/ai-creative/setup?campaignId=${campaignId}`}
          >
            ✦ Start AI Creative
          </Link>
        }
      />
      <CampaignTabs workspaceId={workspaceId} campaignId={campaignId} active="overview" />
      {campaign.isError ? (
        <QueryFailure error={campaign.error} onRetry={() => void campaign.refetch()} />
      ) : (
        <>
          <div className="g-metrics">
            {metric(
              "Status",
              item ? <StatusPill status={item.status} /> : "—",
              "Campaign lifecycle",
            )}
            {metric("Projects", projects.data?.items.length ?? "—", "Durable Project records")}
            {metric("Campaign assets", assetCount || "—", "Inherited by Projects")}
            {metric("Objective", item?.objectiveCode ?? "—", "Creative direction")}
          </div>
          <div className="g-two-column">
            <section className="g-card">
              <SectionHeader
                title="Campaign context"
                description="Identity remains explicit; no CreativeSet is inferred as a Project."
              />
              <dl className="g-property-list">
                <div>
                  <dt>Campaign ID</dt>
                  <dd>{campaignId}</dd>
                </div>
                <div>
                  <dt>Brand</dt>
                  <dd>{item?.brandId ?? "—"}</dd>
                </div>
                <div>
                  <dt>Period</dt>
                  <dd>
                    {item?.startDate ?? "Not set"} — {item?.endDate ?? "Open"}
                  </dd>
                </div>
                <div>
                  <dt>Revision</dt>
                  <dd>{item?.revisionNo ?? "—"}</dd>
                </div>
              </dl>
            </section>
            <section className="g-card">
              <SectionHeader
                title="Projects"
                description="Focused creative workspaces under this Campaign."
                action={
                  <Link
                    className="g-text-link"
                    to={`/w/${workspaceId}/campaigns/${campaignId}/projects`}
                  >
                    View all
                  </Link>
                }
              />
              {projects.data?.items.length ? (
                <div className="g-project-list">
                  {projects.data.items.slice(0, 4).map((project) => (
                    <Link
                      key={project.id}
                      to={`/w/${workspaceId}/campaigns/${campaignId}/projects/${project.id}`}
                    >
                      <span className="g-project-mark" aria-hidden="true">
                        P
                      </span>
                      <span>
                        <strong>{project.name}</strong>
                        <small>{project.description ?? "No description"}</small>
                      </span>
                      <StatusPill status={project.status} />
                    </Link>
                  ))}
                </div>
              ) : (
                <Empty
                  title="No Projects"
                  description="Create a durable Project before generating Project-scoped creatives."
                />
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

export function CampaignAssetsPage() {
  const { workspaceId = "", campaignId = "" } = useParams();
  const pool = useQuery({
    queryKey: queryKeys.campaignAssets(workspaceId, campaignId),
    queryFn: () =>
      apiClient.get<
        Resource<{
          readonly selections?: readonly EffectiveAssetRecord[];
          readonly items?: readonly EffectiveAssetRecord[];
        }>
      >(`/workspaces/${workspaceId}/campaigns/${campaignId}/asset-pool`),
  });
  const items = pool.data?.data.items ?? pool.data?.data.selections ?? [];
  return (
    <div data-screen-id="CAMPAIGN-02" className="g-screen">
      <PageHeader
        eyebrow="CAMPAIGN ASSETS"
        title="Campaign Asset Pool"
        description="Assets selected here become inherited inputs for every Project in this Campaign."
      />
      <CampaignTabs workspaceId={workspaceId} campaignId={campaignId} active="assets" />
      <div className="g-callout">
        <strong>Inheritance is visible</strong>
        <p>
          Project screens label Campaign sources separately. The UI never silently copies or
          reassigns asset ownership.
        </p>
      </div>
      {pool.isLoading ? (
        <LoadingCards count={4} />
      ) : pool.isError ? (
        <QueryFailure error={pool.error} onRetry={() => void pool.refetch()} />
      ) : items.length ? (
        <div className="g-asset-grid">
          {items.map((asset) => (
            <article className="g-asset-card" key={asset.id ?? asset.assetVersionId}>
              <div className="g-asset-visual" aria-hidden="true">
                <span>{asset.roleCode?.slice(0, 2) ?? "AS"}</span>
              </div>
              <div>
                <StatusPill
                  status={
                    asset.licenseStatus ?? (asset.eligible === false ? "INELIGIBLE" : "READY")
                  }
                />
                <h2>{asset.name ?? `Asset ${asset.assetVersionId.slice(0, 8)}`}</h2>
                <p>{asset.roleCode ?? "REFERENCE"} · Campaign source</p>
                <small>{asset.assetVersionId}</small>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="No Campaign assets"
          description="Use the established Campaign asset selection flow to add eligible brand Asset Versions."
        />
      )}
    </div>
  );
}

export function CampaignProjectsPage() {
  const { workspaceId = "", campaignId = "" } = useParams();
  const projects = useProjects(workspaceId, campaignId);
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const create = useMutation({
    mutationFn: () =>
      apiClient.post<Resource<ProjectRecord>>(
        `/workspaces/${workspaceId}/campaigns/${campaignId}/projects`,
        { name, description },
      ),
    onSuccess() {
      setName("");
      setDescription("");
      setCreating(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects(workspaceId, campaignId) });
    },
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate();
  }
  return (
    <div data-screen-id="CAMPAIGN-03" className="g-screen">
      <PageHeader
        eyebrow="CAMPAIGN PROJECTS"
        title="Projects"
        description="Create focused, durable creative workspaces without replacing the Campaign hierarchy."
        actions={
          <PlumeButton
            type="button"
            label={creating ? "Close form" : "New Project"}
            variant="primary"
            onClick={() => setCreating(!creating)}
          />
        }
      />
      <CampaignTabs workspaceId={workspaceId} campaignId={campaignId} active="projects" />
      {creating ? (
        <form className="g-card g-inline-form" onSubmit={submit}>
          <SectionHeader
            title="Create Project"
            description="The Project is persisted under this exact Campaign."
          />
          <label>
            <span>Name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label>
            <span>Description (optional)</span>
            <input value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          {create.isError ? <QueryFailure error={create.error} /> : null}
          <div className="g-action-row">
            <PlumeButton
              type="button"
              label="Cancel"
              variant="secondary"
              onClick={() => setCreating(false)}
            />
            <PlumeButton
              type="submit"
              label={create.isPending ? "Creating…" : "Create Project"}
              variant="primary"
              isDisabled={!name.trim() || create.isPending}
            />
          </div>
        </form>
      ) : null}
      {projects.isLoading ? (
        <LoadingCards />
      ) : projects.isError ? (
        <QueryFailure error={projects.error} onRetry={() => void projects.refetch()} />
      ) : projects.data?.items.length ? (
        <div className="g-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Status</th>
                <th>Revision</th>
                <th>Updated</th>
                <th>
                  <span className="g-visually-hidden">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {projects.data.items.map((project) => (
                <tr key={project.id}>
                  <td>
                    <strong>{project.name}</strong>
                    <small>{project.description ?? "No description"}</small>
                  </td>
                  <td>
                    <StatusPill status={project.status} />
                  </td>
                  <td>v{project.revisionNo}</td>
                  <td>{new Date(project.updatedAt).toLocaleDateString()}</td>
                  <td>
                    <Link
                      className="g-text-link"
                      to={`/w/${workspaceId}/campaigns/${campaignId}/projects/${project.id}`}
                    >
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="No Projects yet"
          description="Create the first durable Project for this Campaign."
        />
      )}
    </div>
  );
}

export function ProjectOverviewPage() {
  const { workspaceId = "", campaignId, projectId = "" } = useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const project = useProject(workspaceId, projectId);
  const assets = useEffectiveAssets(workspaceId, projectId);
  const sets = useQuery({
    queryKey: queryKeys.projectCreativeSets(workspaceId, projectId),
    queryFn: () =>
      apiClient.get<Collection<CreativeSetRecord>>(
        `/workspaces/${workspaceId}/projects/${projectId}/creative-sets`,
      ),
  });
  const item = project.data?.data;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const update = useMutation({
    mutationFn: () =>
      apiClient.patch<Resource<ProjectRecord>>(`/workspaces/${workspaceId}/projects/${projectId}`, {
        name,
        description,
      }),
    onSuccess() {
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(workspaceId, projectId) });
    },
  });
  const archive = useMutation({
    mutationFn: () => apiClient.delete(`/workspaces/${workspaceId}/projects/${projectId}`),
    onSuccess() {
      const parentCampaignId = campaignId ?? item?.campaignId;
      navigate(
        parentCampaignId
          ? `/w/${workspaceId}/campaigns/${parentCampaignId}/projects`
          : `/w/${workspaceId}/campaigns`,
      );
    },
  });
  function beginEdit() {
    setName(item?.name ?? "");
    setDescription(item?.description ?? "");
    setEditing(true);
  }
  const aiQuery = new URLSearchParams({
    ...(item?.campaignId ? { campaignId: item.campaignId } : {}),
    projectId,
  });
  return (
    <div data-screen-id="PROJECT-01" className="g-screen">
      <PageHeader
        eyebrow="PROJECT OVERVIEW"
        title={item?.name ?? "Project"}
        description={item?.description ?? "Project-scoped assets and canonical creative output."}
        actions={
          <>
            <PlumeButton
              type="button"
              label="Edit Project"
              variant="secondary"
              onClick={beginEdit}
            />
            <PlumeButton
              type="button"
              label="Archive"
              variant="ghost"
              onClick={() => {
                if (window.confirm(`Archive ${item?.name ?? "this Project"}?`)) archive.mutate();
              }}
            />
            <Link className="g-primary-link" to={`/w/${workspaceId}/ai-creative/setup?${aiQuery}`}>
              ✦ Create with AI
            </Link>
          </>
        }
      />
      <ProjectTabs
        workspaceId={workspaceId}
        campaignId={campaignId ?? item?.campaignId}
        projectId={projectId}
        active="overview"
      />
      {editing ? (
        <form
          className="g-card g-inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            update.mutate();
          }}
        >
          <SectionHeader
            title="Edit Project"
            description="The parent Campaign remains immutable."
          />
          <label>
            <span>Name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label>
            <span>Description</span>
            <input value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          {update.isError ? <QueryFailure error={update.error} /> : null}
          <div className="g-action-row">
            <PlumeButton
              type="button"
              label="Cancel"
              variant="secondary"
              onClick={() => setEditing(false)}
            />
            <PlumeButton
              type="submit"
              label={update.isPending ? "Saving…" : "Save changes"}
              variant="primary"
              isDisabled={!name.trim() || update.isPending}
            />
          </div>
        </form>
      ) : null}
      {project.isError ? (
        <QueryFailure error={project.error} onRetry={() => void project.refetch()} />
      ) : (
        <>
          <div className="g-metrics">
            {metric(
              "Status",
              item ? <StatusPill status={item.status} /> : "—",
              "Durable lifecycle",
            )}
            {metric("Effective assets", assets.data?.items.length ?? "—", "Campaign + Project")}
            {metric("Creative sets", sets.data?.items.length ?? "—", "Canonical groups")}
            {metric("Revision", item ? `v${item.revisionNo}` : "—", "Optimistic concurrency")}
          </div>
          <div className="g-two-column">
            <section className="g-card">
              <SectionHeader
                title="Asset sources"
                description="Effective inputs remain visibly separated by origin."
              />
              {assets.data?.items.length ? (
                <div className="g-source-bars">
                  {(["CAMPAIGN", "PROJECT", "BOTH"] as const).map((source) => {
                    const count = assets.data.items.filter(
                      (asset) => asset.source === source,
                    ).length;
                    return (
                      <div key={source}>
                        <span>{source}</span>
                        <div>
                          <i
                            style={{
                              width: `${Math.max(5, (count / assets.data.items.length) * 100)}%`,
                            }}
                          />
                        </div>
                        <strong>{count}</strong>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <Empty
                  title="No effective assets"
                  description="Add Campaign or Project references before generation."
                />
              )}
            </section>
            <section className="g-card">
              <SectionHeader
                title="Recent creative sets"
                action={
                  <Link
                    className="g-text-link"
                    to={
                      item?.campaignId
                        ? `/w/${workspaceId}/campaigns/${item.campaignId}/projects/${projectId}/creatives`
                        : `/w/${workspaceId}/projects/${projectId}/creatives`
                    }
                  >
                    View creatives
                  </Link>
                }
              />
              {sets.data?.items.length ? (
                <div className="g-project-list">
                  {sets.data.items.slice(0, 4).map((set) => (
                    <div key={set.id} className="g-static-row">
                      <span className="g-project-mark" aria-hidden="true">
                        C
                      </span>
                      <span>
                        <strong>{set.name}</strong>
                        <small>
                          {set.generationRequestId
                            ? `Generation ${set.generationRequestId.slice(0, 8)}`
                            : "No generation link"}
                        </small>
                      </span>
                      <StatusPill status={set.status} />
                    </div>
                  ))}
                </div>
              ) : (
                <Empty
                  title="No creative sets"
                  description="Run Project-scoped generation to create the first durable set."
                />
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

export function ProjectAssetsPage() {
  const { workspaceId = "", campaignId, projectId = "" } = useParams();
  const queryClient = useQueryClient();
  const local = useQuery({
    queryKey: queryKeys.projectAssets(workspaceId, projectId),
    queryFn: () =>
      apiClient.get<Collection<ProjectAssetReferenceRecord>>(
        `/workspaces/${workspaceId}/projects/${projectId}/assets`,
      ),
  });
  const effective = useEffectiveAssets(workspaceId, projectId);
  const usages = useQuery({
    queryKey: [...queryKeys.project(workspaceId, projectId), "asset-usages"],
    queryFn: () =>
      apiClient.get<Collection<AssetUsageRecord>>(
        `/workspaces/${workspaceId}/projects/${projectId}/asset-usages`,
      ),
  });
  const [versionId, setVersionId] = useState("");
  const [roleCode, setRoleCode] = useState("REFERENCE");
  const add = useMutation({
    mutationFn: () =>
      apiClient.post<Resource<ProjectAssetReferenceRecord>>(
        `/workspaces/${workspaceId}/projects/${projectId}/assets`,
        { assetVersionId: versionId, roleCode },
      ),
    onSuccess() {
      setVersionId("");
      void queryClient.invalidateQueries({
        queryKey: queryKeys.projectAssets(workspaceId, projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.projectAssets(workspaceId, projectId, true),
      });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      apiClient.delete(`/workspaces/${workspaceId}/projects/${projectId}/assets/${id}`),
    onSuccess() {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.projectAssets(workspaceId, projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.projectAssets(workspaceId, projectId, true),
      });
    },
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    add.mutate();
  }
  return (
    <div data-screen-id="PROJECT-02" className="g-screen">
      <PageHeader
        eyebrow="PROJECT ASSETS"
        title="Effective Asset Pool"
        description="Campaign inheritance and Project-local references are visible, durable, and role-aware."
      />
      <ProjectTabs
        workspaceId={workspaceId}
        campaignId={campaignId}
        projectId={projectId}
        active="assets"
      />
      <div className="g-two-column">
        <section className="g-card">
          <SectionHeader
            title="Project-local references"
            description="Add an existing Asset Version by its durable ID."
          />
          <form className="g-compact-form" onSubmit={submit}>
            <label>
              <span>Asset Version ID</span>
              <input
                value={versionId}
                onChange={(event) => setVersionId(event.target.value)}
                required
              />
            </label>
            <label>
              <span>Role</span>
              <select value={roleCode} onChange={(event) => setRoleCode(event.target.value)}>
                {[
                  "REFERENCE",
                  "LOGO",
                  "MODEL",
                  "PRODUCT",
                  "KEY_VISUAL",
                  "BACKGROUND",
                  "BADGE",
                  "GRAPHIC",
                ].map((role) => (
                  <option key={role} value={role}>
                    {role.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <PlumeButton
              type="submit"
              label={add.isPending ? "Adding…" : "Add reference"}
              variant="primary"
              isDisabled={!versionId.trim() || add.isPending}
            />
          </form>
          {add.isError ? <QueryFailure error={add.error} /> : null}
          {local.isLoading ? (
            <LoadingCards count={2} />
          ) : local.data?.items.length ? (
            <div className="g-asset-list">
              {local.data.items.map((asset) => (
                <article className="g-asset-row" key={asset.id}>
                  <div className="g-asset-thumb" aria-hidden="true">
                    {asset.roleCode[0]}
                  </div>
                  <div>
                    <strong>{asset.assetVersionId}</strong>
                    <span>{asset.roleCode} · Project local</span>
                  </div>
                  <PlumeButton
                    type="button"
                    label="Remove"
                    variant="ghost"
                    onClick={() => remove.mutate(asset.id)}
                  />
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title="No Project-local assets"
              description="Campaign assets may still be inherited through the effective pool."
            />
          )}
        </section>
        <section className="g-card">
          <SectionHeader
            title="Resolved effective pool"
            description="This exact context is frozen server-side before generation."
          />
          {effective.isLoading ? (
            <LoadingCards count={3} />
          ) : effective.isError ? (
            <QueryFailure error={effective.error} onRetry={() => void effective.refetch()} />
          ) : effective.data?.items.length ? (
            <div className="g-asset-list">
              {effective.data.items.map((asset) => (
                <article className="g-asset-row" key={`${asset.assetVersionId}-${asset.roleCode}`}>
                  <div className="g-asset-thumb" aria-hidden="true">
                    {asset.source?.[0] ?? "A"}
                  </div>
                  <div>
                    <strong>{asset.name ?? asset.assetVersionId}</strong>
                    <span>
                      {asset.roleCode ?? "Legacy role absent"} · {asset.source} · Used by{" "}
                      {
                        new Set(
                          (usages.data?.items ?? [])
                            .filter((item) => item.assetVersionId === asset.assetVersionId)
                            .map((item) => item.creativeId),
                        ).size
                      }{" "}
                      creatives
                    </span>
                  </div>
                  <StatusPill status={asset.eligible === false ? "INELIGIBLE" : "READY"} />
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title="Effective pool is empty"
              description="Generation fails closed until eligible assets resolve."
            />
          )}
        </section>
      </div>
    </div>
  );
}

export function ProjectCreativesPage() {
  const { workspaceId = "", campaignId, projectId = "" } = useParams();
  const sets = useQuery({
    queryKey: queryKeys.projectCreativeSets(workspaceId, projectId),
    queryFn: () =>
      apiClient.get<Collection<CreativeSetRecord>>(
        `/workspaces/${workspaceId}/projects/${projectId}/creative-sets`,
      ),
  });
  const creativeQueries = useQueries({
    queries: (sets.data?.items ?? []).map((set) => ({
      queryKey: queryKeys.creatives(workspaceId, set.id),
      queryFn: () =>
        apiClient.get<Collection<CreativeRecord>>(
          `/workspaces/${workspaceId}/creative-sets/${set.id}/creatives`,
        ),
    })),
  });
  const rows = (sets.data?.items ?? []).flatMap((set, index) =>
    (creativeQueries[index]?.data?.items ?? []).map((creative) => ({ set, creative })),
  );
  const [status, setStatus] = useState("ALL");
  const visible = status === "ALL" ? rows : rows.filter((row) => row.creative.status === status);
  return (
    <div data-screen-id="PROJECT-03" className="g-screen">
      <PageHeader
        eyebrow="PROJECT CREATIVES"
        title="Creative library"
        description="Every card is backed by Project → CreativeSet → Creative → current CreativeVersion durability."
      />
      <ProjectTabs
        workspaceId={workspaceId}
        campaignId={campaignId}
        projectId={projectId}
        active="creatives"
      />
      <div className="g-filterbar">
        <label>
          <span>Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="ALL">All statuses</option>
            <option value="GENERATED">Generated</option>
            <option value="READY_FOR_APPROVAL">Ready for approval</option>
            <option value="APPROVED">Approved</option>
          </select>
        </label>
        <span>{visible.length} creatives</span>
      </div>
      {sets.isLoading || creativeQueries.some((query) => query.isLoading) ? (
        <LoadingCards count={4} />
      ) : sets.isError ? (
        <QueryFailure error={sets.error} onRetry={() => void sets.refetch()} />
      ) : creativeQueries.some((query) => query.isError) ? (
        <QueryFailure
          error={creativeQueries.find((query) => query.isError)?.error}
          onRetry={() => {
            for (const query of creativeQueries) if (query.isError) void query.refetch();
          }}
        />
      ) : visible.length ? (
        <div className="g-creative-grid">
          {visible.map(({ set, creative }) => (
            <ProjectCreativeCard
              key={creative.id}
              workspaceId={workspaceId}
              projectId={projectId}
              set={set}
              creative={creative}
            />
          ))}
        </div>
      ) : (
        <Empty
          title="No creatives found"
          description={
            rows.length
              ? "Adjust the status filter."
              : "Complete Project-scoped generation to create canonical creatives."
          }
          action={
            <Link
              className="g-primary-link"
              to={`/w/${workspaceId}/ai-creative/setup?${new URLSearchParams({ ...(campaignId ? { campaignId } : {}), projectId })}`}
            >
              Start AI Creative
            </Link>
          }
        />
      )}
    </div>
  );
}

export function SettingsPage() {
  const { preference, resolved, setPreference } = useTheme();
  const options: readonly {
    readonly id: ThemePreference;
    readonly label: string;
    readonly description: string;
  }[] = [
    { id: "system", label: "System", description: "Follow this device’s appearance setting." },
    { id: "light", label: "Light", description: "Calm neutral surfaces with dark text." },
    { id: "dark", label: "Dark", description: "Low-glare surfaces with high-contrast text." },
  ];
  return (
    <div data-screen-id="SETTINGS-01" className="g-screen">
      <PageHeader
        eyebrow="WORKSPACE SETTINGS"
        title="Preferences"
        description="Personal presentation settings do not change Campaign, Project, or generation contracts."
      />
      <section className="g-card g-settings-card">
        <SectionHeader
          title="Appearance"
          description={`Current resolved theme: ${resolved}. Your choice persists on this device.`}
        />
        <fieldset className="g-theme-options">
          <legend>Theme</legend>
          {options.map((option) => (
            <label key={option.id} className={preference === option.id ? "is-selected" : ""}>
              <input
                type="radio"
                name="theme"
                value={option.id}
                checked={preference === option.id}
                onChange={() => setPreference(option.id)}
              />
              <span className={`g-theme-swatch g-theme-${option.id}`} aria-hidden="true">
                <i />
                <i />
              </span>
              <span>
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </span>
              <span className="g-radio-indicator" aria-hidden="true" />
            </label>
          ))}
        </fieldset>
      </section>
      <section className="g-card">
        <SectionHeader
          title="Accessibility"
          description="The interface respects reduced motion, forced colors, keyboard focus, and 200% reflow."
        />
        <ul className="g-check-list">
          <li>
            <span aria-hidden="true">✓</span>Visible focus ring and skip navigation
          </li>
          <li>
            <span aria-hidden="true">✓</span>Non-color status labels
          </li>
          <li>
            <span aria-hidden="true">✓</span>Responsive limited editor disclosure
          </li>
        </ul>
      </section>
    </div>
  );
}

export function MissingRoutePage() {
  const { workspaceId = "" } = useParams();
  return (
    <div className="g-screen">
      <Empty
        title="Page not found"
        description="The requested workspace route does not exist."
        action={
          <Link className="g-primary-link" to={`/w/${workspaceId}/ai-creative/setup`}>
            Return to AI Creative
          </Link>
        }
      />
    </div>
  );
}

export function LegacyStepRedirect() {
  const { workspaceId = "", step = "setup" } = useParams();
  const location = useLocation();
  const known = ["setup", "format", "generate", "editor"].includes(step) ? step : "setup";
  return <Navigate replace to={`/w/${workspaceId}/ai-creative/${known}${location.search}`} />;
}
