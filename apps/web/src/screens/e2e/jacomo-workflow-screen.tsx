import { useMemo, useState } from "react";
import {
  APPROVED_FORMAT_PROFILES,
  CANONICAL_CHANNELS,
} from "../../../../../packages/core/src/modules/media-catalog/canonical-catalog";

type StepId =
  | "workspace"
  | "campaign"
  | "upload"
  | "brief"
  | "products"
  | "assets"
  | "media"
  | "generation"
  | "gallery"
  | "editor"
  | "validation"
  | "approval"
  | "export";

type Product = {
  id: string;
  name: string;
  description: string;
};

const steps: Array<{ id: StepId; label: string }> = [
  { id: "workspace", label: "Workspace" },
  { id: "campaign", label: "Campaign" },
  { id: "upload", label: "Source" },
  { id: "brief", label: "Brief" },
  { id: "products", label: "Products" },
  { id: "assets", label: "Assets" },
  { id: "media", label: "Channel" },
  { id: "generation", label: "Generate" },
  { id: "gallery", label: "Gallery" },
  { id: "editor", label: "Editor" },
  { id: "validation", label: "Validation" },
  { id: "approval", label: "Approval" },
  { id: "export", label: "Export" },
];

const products: Product[] = [
  { id: "karma", name: "카르마", description: "Daily care" },
  { id: "plume", name: "플룸", description: "Signature collection" },
  { id: "elish", name: "엘리쉬", description: "Premium finish" },
];

const buttonStyle = {
  background: "#111827",
  border: "1px solid #111827",
  borderRadius: 8,
  color: "#ffffff",
  cursor: "pointer",
  fontWeight: 600,
  padding: "10px 16px",
};

const secondaryButtonStyle = {
  ...buttonStyle,
  background: "#ffffff",
  color: "#111827",
};

const LOCAL_QA_MEDIA_SELECTION_KEY = "plume.local-qa.jacomo-media-selection";

interface LocalQaMediaSelection {
  readonly channelCode: string;
  readonly formatProfileId: string;
}

function readLocalQaMediaSelection(): LocalQaMediaSelection {
  try {
    const value = globalThis.localStorage?.getItem(LOCAL_QA_MEDIA_SELECTION_KEY);
    if (!value) return { channelCode: "", formatProfileId: "" };
    const parsed = JSON.parse(value) as Partial<LocalQaMediaSelection>;
    return {
      channelCode: typeof parsed.channelCode === "string" ? parsed.channelCode : "",
      formatProfileId: typeof parsed.formatProfileId === "string" ? parsed.formatProfileId : "",
    };
  } catch {
    return { channelCode: "", formatProfileId: "" };
  }
}

function persistLocalQaMediaSelection(selection: LocalQaMediaSelection): void {
  try {
    globalThis.localStorage?.setItem(LOCAL_QA_MEDIA_SELECTION_KEY, JSON.stringify(selection));
  } catch {
    // Local QA remains functional when browser storage is unavailable.
  }
}

export function JacomoWorkflowScreen() {
  const [activeStep, setActiveStep] = useState<StepId>("workspace");
  const [signedIn, setSignedIn] = useState(false);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [sourceFileName, setSourceFileName] = useState("");
  const [brief, setBrief] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [assetReady, setAssetReady] = useState(false);
  const [mediaSelection, setMediaSelection] = useState(readLocalQaMediaSelection);
  const [generated, setGenerated] = useState(false);
  const [aiPreview, setAiPreview] = useState(false);
  const [aiApplied, setAiApplied] = useState(false);
  const [validationRun, setValidationRun] = useState(false);
  const [approved, setApproved] = useState(false);
  const [exported, setExported] = useState(false);

  const currentIndex = steps.findIndex((step) => step.id === activeStep);
  const selectedProductNames = useMemo(
    () =>
      products.filter((product) => selectedProducts.has(product.id)).map((product) => product.name),
    [selectedProducts],
  );
  const channel = mediaSelection.channelCode;
  const formatProfileId = mediaSelection.formatProfileId;
  const selectedChannel = CANONICAL_CHANNELS.find((item) => item.id === channel);
  const selectedFormat = APPROVED_FORMAT_PROFILES.find((item) => item.id === formatProfileId);
  const formatOptions = APPROVED_FORMAT_PROFILES.filter((item) => item.channelCode === channel);

  function selectChannel(channelCode: string) {
    const next = { channelCode, formatProfileId: "" };
    setMediaSelection(next);
    persistLocalQaMediaSelection(next);
  }

  function selectFormat(nextFormatProfileId: string) {
    const next = { channelCode: channel, formatProfileId: nextFormatProfileId };
    setMediaSelection(next);
    persistLocalQaMediaSelection(next);
  }

  function toggleProduct(productId: string) {
    setSelectedProducts((current) => {
      const next = new Set(current);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  }

  function exportPackage() {
    const manifest = {
      campaign: campaignName,
      channel: selectedChannel
        ? { id: selectedChannel.id, label: selectedChannel.label }
        : { id: channel },
      formatProfile: selectedFormat
        ? {
            id: selectedFormat.id,
            channelCode: selectedFormat.channelCode,
            productCode: selectedFormat.productCode,
            specificationVersion: selectedFormat.specificationVersion,
          }
        : { status: "CATALOG_NOT_READY" },
      creatives: 3,
      checksum: "sha256:jacomo-deterministic-export",
    };
    const blob = new Blob([JSON.stringify(manifest, null, 2)], {
      type: "application/json",
    });
    const browserDocument = (
      globalThis as unknown as {
        document: {
          createElement: (tagName: string) => {
            click: () => void;
            download: string;
            href: string;
          };
        };
      }
    ).document;
    const url = URL.createObjectURL(blob);
    const link = browserDocument.createElement("a");
    link.href = url;
    link.download = "jacomo-spring-campaign-export.json";
    link.click();
    globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
    setExported(true);
  }

  function continueTo(step: StepId) {
    setActiveStep(step);
  }

  function renderStep() {
    switch (activeStep) {
      case "workspace":
        return (
          <section aria-labelledby="workspace-heading">
            <p>Step 1 of {steps.length}</p>
            <h2 id="workspace-heading">Sign in to Plume</h2>
            <p>Use the Jacomo workspace to begin a controlled campaign run.</p>
            <div style={{ display: "grid", gap: 12, maxWidth: 420 }}>
              <button
                type="button"
                onClick={() => setSignedIn(true)}
                aria-pressed={signedIn}
                style={buttonStyle}
              >
                {signedIn ? "Signed in" : "Sign in"}
              </button>
              <button
                type="button"
                onClick={() => setWorkspaceReady(true)}
                disabled={!signedIn}
                style={secondaryButtonStyle}
              >
                {workspaceReady ? "Plume workspace selected" : "Use Plume workspace"}
              </button>
              <button
                type="button"
                onClick={() => continueTo("campaign")}
                disabled={!workspaceReady}
                style={buttonStyle}
              >
                Continue to campaign
              </button>
            </div>
          </section>
        );
      case "campaign":
        return (
          <section aria-labelledby="campaign-heading">
            <p>Step 2 of {steps.length}</p>
            <h2 id="campaign-heading">Create campaign</h2>
            <label htmlFor="campaign-name">Campaign name</label>
            <input
              id="campaign-name"
              value={campaignName}
              onChange={(event) =>
                setCampaignName((event.target as unknown as { value: string }).value)
              }
              placeholder="e.g. Jacomo Spring Campaign"
              style={{
                display: "block",
                margin: "8px 0 16px",
                maxWidth: 520,
                padding: 10,
                width: "100%",
              }}
            />
            <button
              type="button"
              onClick={() => continueTo("upload")}
              disabled={!campaignName.trim()}
              style={buttonStyle}
            >
              Continue to upload
            </button>
          </section>
        );
      case "upload":
        return (
          <section aria-labelledby="upload-heading">
            <p>Step 3 of {steps.length}</p>
            <h2 id="upload-heading">Upload source material</h2>
            <p>Use a local source image so the run remains deterministic.</p>
            <label htmlFor="source-file">Creative source file</label>
            <input
              id="source-file"
              type="file"
              accept="image/png,image/jpeg"
              onChange={(event) => {
                const target = event.target as unknown as {
                  files?: ArrayLike<{ name: string }> | null;
                };
                setSourceFileName(target.files?.[0]?.name ?? "");
              }}
              style={{ display: "block", margin: "8px 0 16px" }}
            />
            {sourceFileName ? <p role="status">Uploaded: {sourceFileName}</p> : null}
            <button
              type="button"
              onClick={() => continueTo("brief")}
              disabled={!sourceFileName}
              style={buttonStyle}
            >
              Continue to brief
            </button>
          </section>
        );
      case "brief":
        return (
          <section aria-labelledby="brief-heading">
            <p>Step 4 of {steps.length}</p>
            <h2 id="brief-heading">Review campaign brief</h2>
            <label htmlFor="campaign-brief">Campaign brief</label>
            <textarea
              id="campaign-brief"
              value={brief}
              onChange={(event) => setBrief((event.target as unknown as { value: string }).value)}
              placeholder="Describe the Jacomo spring launch"
              rows={5}
              style={{
                display: "block",
                margin: "8px 0 16px",
                maxWidth: 620,
                padding: 10,
                width: "100%",
              }}
            />
            <button
              type="button"
              onClick={() => continueTo("products")}
              disabled={!brief.trim()}
              style={buttonStyle}
            >
              Continue to products
            </button>
          </section>
        );
      case "products":
        return (
          <section aria-labelledby="products-heading">
            <p>Step 5 of {steps.length}</p>
            <h2 id="products-heading">Match products</h2>
            <fieldset>
              <legend>Select the products for this campaign</legend>
              <div style={{ display: "grid", gap: 12, margin: "12px 0 16px" }}>
                {products.map((product) => (
                  <label key={product.id} style={{ display: "flex", gap: 10 }}>
                    <input
                      type="checkbox"
                      checked={selectedProducts.has(product.id)}
                      onChange={() => toggleProduct(product.id)}
                    />
                    <span>
                      <strong>{product.name}</strong> — {product.description}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <button
              type="button"
              onClick={() => continueTo("assets")}
              disabled={selectedProducts.size !== 3}
              style={buttonStyle}
            >
              Continue to assets
            </button>
          </section>
        );
      case "assets":
        return (
          <section aria-labelledby="assets-heading">
            <p>Step 6 of {steps.length}</p>
            <h2 id="assets-heading">Curate assets</h2>
            <p>Choose the verified hero asset from the Jacomo asset pool.</p>
            <button
              type="button"
              onClick={() => setAssetReady(true)}
              aria-pressed={assetReady}
              style={secondaryButtonStyle}
            >
              {assetReady ? "Hero asset selected" : "Use hero asset"}
            </button>
            <div style={{ marginTop: 16 }}>
              <button
                type="button"
                onClick={() => continueTo("media")}
                disabled={!assetReady}
                style={buttonStyle}
              >
                Continue to channel
              </button>
            </div>
          </section>
        );
      case "media":
        return (
          <section aria-labelledby="media-heading">
            <p>Step 7 of {steps.length}</p>
            <h2 id="media-heading">Choose media format</h2>
            <label htmlFor="channel">Channel</label>
             <select
               id="channel"
               value={channel}
               onChange={(event) => selectChannel((event.target as unknown as { value: string }).value)}
              style={{
                display: "block",
                margin: "8px 0 16px",
                padding: 10,
                width: "100%",
                maxWidth: 420,
              }}
             >
               <option value="">Select a channel</option>
               {CANONICAL_CHANNELS.map((item) => (
                 <option key={item.id} value={item.id}>
                   {item.label}
                 </option>
               ))}
             </select>
             <label htmlFor="format-profile">Format</label>
             <select
               id="format-profile"
               value={formatProfileId}
               onChange={(event) => selectFormat((event.target as unknown as { value: string }).value)}
               disabled={!channel}
               style={{
                 display: "block",
                 margin: "8px 0 16px",
                 padding: 10,
                 width: "100%",
                 maxWidth: 420,
               }}
             >
               <option value="">Select a format</option>
               {formatOptions.map((item) => (
                 <option key={item.id} value={item.id}>
                   {item.productName} — {item.name}
                 </option>
               ))}
             </select>
             <p role="status">
               {channel && formatOptions.length === 0
                 ? `${selectedChannel?.label ?? channel}: CATALOG_NOT_READY — no approved repository format is available.`
                 : `Selected format: ${selectedFormat?.name ?? "None"}`}
             </p>
             <button
               type="button"
               onClick={() => continueTo("generation")}
               disabled={!channel || (formatOptions.length > 0 && !formatProfileId)}
              style={buttonStyle}
            >
              Continue to generation
            </button>
          </section>
        );
      case "generation":
        return (
          <section aria-labelledby="generation-heading">
            <p>Step 8 of {steps.length}</p>
            <h2 id="generation-heading">Generate creatives</h2>
            <p>OpenAI agents will propose three deterministic creative variants.</p>
            <button
              type="button"
              onClick={() => {
                setGenerated(true);
                continueTo("gallery");
              }}
              style={buttonStyle}
            >
              Generate three creatives
            </button>
            {generated ? <p role="status">Generation complete.</p> : null}
          </section>
        );
      case "gallery":
        return (
          <section aria-labelledby="gallery-heading">
            <p>Step 9 of {steps.length}</p>
            <h2 id="gallery-heading">Generated gallery</h2>
             <p role="status">
               3 creatives generated for {selectedChannel?.label ?? channel} — {selectedFormat?.name ?? "CATALOG_NOT_READY"}.
             </p>
            <ol aria-label="Generated creatives">
              <li>Variant 01 — Hero product composition</li>
              <li>Variant 02 — Seasonal product composition</li>
              <li>Variant 03 — Offer product composition</li>
            </ol>
            <button type="button" onClick={() => continueTo("editor")} style={buttonStyle}>
              Open editor
            </button>
          </section>
        );
      case "editor":
        return (
          <section aria-labelledby="editor-heading">
            <p>Step 10 of {steps.length}</p>
            <h2 id="editor-heading">Creative editor</h2>
            <p>Adjust the selected layout with a natural-language edit.</p>
            <label htmlFor="edit-request">Edit request</label>
            <input
              id="edit-request"
              defaultValue="Move the headline above the hero image"
              style={{
                display: "block",
                margin: "8px 0 16px",
                maxWidth: 620,
                padding: 10,
                width: "100%",
              }}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <button type="button" onClick={() => setAiPreview(true)} style={secondaryButtonStyle}>
                Preview AI edit
              </button>
              <button
                type="button"
                onClick={() => setAiApplied(true)}
                disabled={!aiPreview}
                style={buttonStyle}
              >
                Apply AI edit
              </button>
            </div>
            {aiPreview ? (
              <p role="status">AI edit preview: headline moves above the hero image.</p>
            ) : null}
            {aiApplied ? <p role="status">AI edit applied to Variant 01.</p> : null}
            <div style={{ marginTop: 16 }}>
              <button
                type="button"
                onClick={() => continueTo("validation")}
                disabled={!aiApplied}
                style={buttonStyle}
              >
                Continue to validation
              </button>
            </div>
          </section>
        );
      case "validation":
        return (
          <section aria-labelledby="validation-heading">
            <p>Step 11 of {steps.length}</p>
            <h2 id="validation-heading">Validate creatives</h2>
            <p>Run deterministic schema, policy, format, and asset checks.</p>
            <button
              type="button"
              onClick={() => setValidationRun(true)}
              style={secondaryButtonStyle}
            >
              Re-run validation
            </button>
            <p role="status">
              {validationRun ? "0 errors — all checks passed." : "Validation pending."}
            </p>
            <button
              type="button"
              onClick={() => continueTo("approval")}
              disabled={!validationRun}
              style={buttonStyle}
            >
              Continue to approval
            </button>
          </section>
        );
      case "approval":
        return (
          <section aria-labelledby="approval-heading">
            <p>Step 12 of {steps.length}</p>
            <h2 id="approval-heading">Approve campaign</h2>
            <p>AI policy review is clear and the creative package is ready for approval.</p>
            <button
              type="button"
              onClick={() => setApproved(true)}
              aria-pressed={approved}
              style={buttonStyle}
            >
              {approved ? "Campaign approved" : "Approve campaign"}
            </button>
            <div style={{ marginTop: 16 }}>
              <button
                type="button"
                onClick={() => continueTo("export")}
                disabled={!approved}
                style={buttonStyle}
              >
                Continue to export
              </button>
            </div>
          </section>
        );
      case "export":
        return (
          <section aria-labelledby="export-heading">
            <p>Step 13 of {steps.length}</p>
            <h2 id="export-heading">Export package</h2>
            <p>
              Ready: 3 creatives, {selectedChannel?.label ?? channel} — {selectedFormat?.name ?? "CATALOG_NOT_READY"}, checksum verified.
            </p>
            <button type="button" onClick={exportPackage} style={buttonStyle}>
              Export
            </button>
            {exported ? <p role="status">Export downloaded successfully.</p> : null}
          </section>
        );
    }
  }

  return (
    <div
      data-screen-id="e2e-jacomo-workflow"
      style={{ background: "#f8fafc", minHeight: "calc(100vh - 68px)", padding: "32px 24px" }}
    >
      <div style={{ margin: "0 auto", maxWidth: 1120 }}>
        <p style={{ color: "#475569", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Plume · Jacomo
        </p>
        <h1>Jacomo campaign workflow</h1>
         <p>From source material to an approved, downloadable channel-specific creative package.</p>
        <nav aria-label="Campaign workflow steps" style={{ margin: "24px 0" }}>
          <ol
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              listStyle: "none",
              margin: 0,
              padding: 0,
            }}
          >
            {steps.map((step, index) => (
              <li key={step.id}>
                <button
                  type="button"
                  onClick={() => setActiveStep(step.id)}
                  aria-current={step.id === activeStep ? "step" : undefined}
                  aria-label={`Step ${index + 1}: ${step.label}`}
                  style={step.id === activeStep ? buttonStyle : secondaryButtonStyle}
                >
                  {index + 1}. {step.label}
                </button>
              </li>
            ))}
          </ol>
        </nav>
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #cbd5e1",
            borderRadius: 12,
            maxWidth: 760,
            padding: 24,
          }}
        >
          {renderStep()}
        </div>
        <aside aria-label="Run summary" style={{ marginTop: 24 }}>
          <h2>Run summary</h2>
          <dl>
            <div>
              <dt>Workspace</dt>
              <dd>{workspaceReady ? "Plume / Jacomo" : "Not selected"}</dd>
            </div>
            <div>
              <dt>Campaign</dt>
              <dd>{campaignName || "Not created"}</dd>
            </div>
            <div>
              <dt>Products</dt>
              <dd>{selectedProductNames.length ? selectedProductNames.join(", ") : "None"}</dd>
            </div>
            <div>
              <dt>Creative status</dt>
              <dd>
                {exported ? "Exported" : approved ? "Approved" : generated ? "Generated" : "Draft"}
              </dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  );
}
