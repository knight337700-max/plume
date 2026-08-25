/// <reference lib="dom" />

import { useEffect, useRef, useState } from "react";
import { ApiError, apiClient } from "../../api/client";

const WORKSPACE_ID = "00000000-0000-4000-8000-0000000006a0";
const FORMAT_ID = "kakao-moment-bizboard-1029x258";
const PROFILE_VERSION = "2026.1";
const CANVAS_WIDTH = 1029;
const CANVAS_HEIGHT = 258;
const MAX_SOURCE_BYTES = 1_000_000;
const MAX_SOURCE_CHARS = 20_000;
const MAX_PRODUCT_IMAGES = 3;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;

interface UploadSession {
  readonly id: string;
  readonly singleUploadUrl: string | null;
}

interface FileObject {
  readonly id: string;
  readonly originalFilename: string;
  readonly mimeType: string;
  readonly bytes: number;
  readonly checksumSha256: string;
}

interface DownloadUrl {
  readonly url: string;
  readonly expiresAt: string;
  readonly filename: string;
}

interface StoredFile extends FileObject {
  readonly readbackBytes: Uint8Array;
}

interface OutputArtifact extends StoredFile {
  readonly downloadFilename: string;
  readonly previewUrl: string;
}

interface CopyFields {
  readonly headline: string;
  readonly subcopy: string;
  readonly cta: string;
}

interface ApiResponse<T> {
  readonly data: T;
}

const hex = (bytes: Uint8Array): string =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function checksum(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", ownedArrayBuffer(bytes));
  return hex(new Uint8Array(digest));
}

function stableError(error: unknown): string {
  if (error instanceof ApiError) return error.problem.code;
  if (error instanceof Error && error.message) return error.message;
  return "UPLOAD_WORKFLOW_FAILED";
}

function imageMagicMatches(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === "image/png") {
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (value, index) => bytes[index] === value,
    );
  }
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function assertTextSource(bytes: Uint8Array): CopyFields {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_SOURCE_BYTES)
    throw new Error("SOURCE_TEXT_SIZE_INVALID");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (text.length === 0 || text.length > MAX_SOURCE_CHARS || text.includes("\u0000"))
    throw new Error("SOURCE_TEXT_INVALID");
  const lines = text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines[0]) throw new Error("SOURCE_TEXT_EMPTY");
  return {
    headline: lines[0].slice(0, 28),
    subcopy: (lines[1] ?? "Synthetic JACOMO Bizboard creative package").slice(0, 50),
    cta: "자세히 보기",
  };
}

async function decodeImage(bytes: Uint8Array, mimeType: string): Promise<ImageBitmap> {
  if (!imageMagicMatches(bytes, mimeType)) throw new Error("IMAGE_MAGIC_MISMATCH");
  const bitmap = await createImageBitmap(new Blob([ownedArrayBuffer(bytes)], { type: mimeType }));
  if (bitmap.width < 1 || bitmap.height < 1 || bitmap.width * bitmap.height > MAX_IMAGE_PIXELS) {
    bitmap.close();
    throw new Error("IMAGE_PIXEL_LIMIT");
  }
  return bitmap;
}

async function blobFromCanvas(
  canvas: HTMLCanvasElement,
  mimeType: "image/png" | "image/jpeg",
): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mimeType, 0.92));
  if (!blob || blob.size <= 1024) throw new Error("RENDER_OUTPUT_TOO_SMALL");
  return blob;
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = [...text];
  const lines: string[] = [];
  let current = "";
  for (const character of words) {
    const candidate = current + character;
    if (current && context.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 2);
}

async function renderCreative(
  canvas: HTMLCanvasElement,
  image: StoredFile,
  copy: CopyFields,
  mimeType: "image/png" | "image/jpeg",
): Promise<Blob> {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("CANVAS_CONTEXT_UNAVAILABLE");
  const bitmap = await decodeImage(image.readbackBytes, image.mimeType);
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  context.fillStyle = "#fffaf2";
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  context.fillStyle = "#1e293b";
  context.fillRect(0, 0, 8, CANVAS_HEIGHT);

  const textWidth = Math.floor(CANVAS_WIDTH * 0.58) - 64;
  context.fillStyle = "#162033";
  context.font = "700 38px Arial, sans-serif";
  context.textBaseline = "top";
  const headlineLines = wrapText(context, copy.headline, textWidth);
  headlineLines.forEach((line, index) => context.fillText(line, 40, 42 + index * 48));
  context.fillStyle = "#536174";
  context.font = "400 20px Arial, sans-serif";
  const subcopyLines = wrapText(context, copy.subcopy, textWidth);
  subcopyLines.forEach((line, index) => context.fillText(line, 40, 144 + index * 27));
  context.fillStyle = "#2563eb";
  context.fillRect(40, 207, 150, 34);
  context.fillStyle = "#ffffff";
  context.font = "700 15px Arial, sans-serif";
  context.textBaseline = "middle";
  context.fillText(copy.cta, 58, 224);

  const imageBox = {
    x: Math.floor(CANVAS_WIDTH * 0.58) + 8,
    y: 24,
    width: Math.floor(CANVAS_WIDTH * 0.42) - 32,
    height: CANVAS_HEIGHT - 48,
  };
  const scale = Math.min(imageBox.width / bitmap.width, imageBox.height / bitmap.height);
  const drawWidth = Math.max(1, Math.floor(bitmap.width * scale));
  const drawHeight = Math.max(1, Math.floor(bitmap.height * scale));
  const drawX = imageBox.x + Math.floor((imageBox.width - drawWidth) / 2);
  const drawY = imageBox.y + Math.floor((imageBox.height - drawHeight) / 2);
  context.fillStyle = "#e2e8f0";
  context.fillRect(imageBox.x, imageBox.y, imageBox.width, imageBox.height);
  context.drawImage(bitmap, drawX, drawY, drawWidth, drawHeight);
  bitmap.close();
  return blobFromCanvas(canvas, mimeType);
}

async function downloadStoredBytes(workspaceId: string, file: FileObject): Promise<Uint8Array> {
  const response = await apiClient.get<ApiResponse<DownloadUrl>>(
    `/workspaces/${workspaceId}/files/${file.id}/download-url`,
  );
  const download = await fetch(response.data.url);
  if (!download.ok) throw new Error("SIGNED_GET_FAILED");
  const bytes = new Uint8Array(await download.arrayBuffer());
  if (bytes.byteLength !== file.bytes || (await checksum(bytes)) !== file.checksumSha256)
    throw new Error("STORAGE_CHECKSUM_MISMATCH");
  return bytes;
}

export function JacomoUserUploadScreen() {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [productFiles, setProductFiles] = useState<File[]>([]);
  const [source, setSource] = useState<StoredFile | null>(null);
  const [images, setImages] = useState<StoredFile[]>([]);
  const [copy, setCopy] = useState<CopyFields | null>(null);
  const [outputs, setOutputs] = useState<OutputArtifact[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(
    "Select one UTF-8 TXT source and one to three product images.",
  );
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(
    () => () => outputs.forEach((output) => URL.revokeObjectURL(output.previewUrl)),
    [outputs],
  );

  const uploadAndReadBack = async (file: File, purpose: "ASSET" | "CAMPAIGN_SOURCE") => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const checksumSha256 = await checksum(bytes);
    const session = await apiClient.post<UploadSession>(`/workspaces/${WORKSPACE_ID}/uploads`, {
      filename: file.name,
      mimeType: file.type,
      bytes: bytes.byteLength,
      checksumSha256,
      purpose,
    });
    if (!session.singleUploadUrl) throw new Error("SIGNED_PUT_MISSING");
    const put = await fetch(session.singleUploadUrl, {
      method: "PUT",
      body: new Blob([ownedArrayBuffer(bytes)]),
    });
    if (!put.ok) throw new Error("SIGNED_PUT_FAILED");
    const completed = await apiClient.post<ApiResponse<FileObject>>(
      `/workspaces/${WORKSPACE_ID}/uploads/${session.id}.complete`,
      { checksumSha256 },
    );
    const readbackBytes = await downloadStoredBytes(WORKSPACE_ID, completed.data);
    return { ...completed.data, readbackBytes };
  };

  const uploadSource = async () => {
    if (!sourceFile) {
      setError("SOURCE_FILE_REQUIRED");
      return;
    }
    try {
      assertTextSource(new Uint8Array(await sourceFile.arrayBuffer()));
    } catch (caught) {
      setError(stableError(caught));
      setStatus("Source upload was rejected; no creative can be generated.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setStatus("Uploading source, completing the session, and verifying Signed GET bytes…");
      const stored = await uploadAndReadBack(sourceFile, "CAMPAIGN_SOURCE");
      const nextCopy = assertTextSource(stored.readbackBytes);
      setSource(stored);
      setCopy(nextCopy);
      setStatus(`Source verified: ${stored.originalFilename}; SHA-256 checksum verified.`);
    } catch (caught) {
      setError(stableError(caught));
      setStatus("Source upload was rejected; no creative can be generated.");
    } finally {
      setBusy(false);
    }
  };

  const uploadProducts = async () => {
    if (productFiles.length < 1 || productFiles.length > MAX_PRODUCT_IMAGES) {
      setError("PRODUCT_IMAGE_COUNT_INVALID");
      return;
    }
    if (productFiles.some((file) => file.size > MAX_IMAGE_BYTES)) {
      setError("PRODUCT_IMAGE_SIZE_INVALID");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const stored: StoredFile[] = [];
      for (const file of productFiles) {
        if (file.type !== "image/png" && file.type !== "image/jpeg")
          throw new Error("PRODUCT_IMAGE_MIME_INVALID");
        setStatus(`Uploading ${file.name} and verifying storage read-back bytes…`);
        const uploaded = await uploadAndReadBack(file, "ASSET");
        const bitmap = await decodeImage(uploaded.readbackBytes, uploaded.mimeType);
        bitmap.close();
        stored.push(uploaded);
      }
      setImages(stored);
      setStatus(`${stored.length} product image storage round-trip(s) verified.`);
    } catch (caught) {
      setError(stableError(caught));
      setStatus("Product image upload was rejected; no creative can be generated.");
    } finally {
      setBusy(false);
    }
  };

  const generate = async () => {
    if (!source || !copy || images.length === 0 || !canvasRef.current) {
      setError("UPLOADS_REQUIRED_BEFORE_GENERATE");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setStatus(`Rendering ${FORMAT_ID} (${PROFILE_VERSION}) at ${CANVAS_WIDTH}×${CANVAS_HEIGHT}…`);
      const image = images[0]!;
      const pngBlob = await renderCreative(canvasRef.current, image, copy, "image/png");
      const jpgBlob = await renderCreative(canvasRef.current, image, copy, "image/jpeg");
      const rendered = [
        new File([pngBlob], "jacomo-bizboard-1029x258-variant-01.png", { type: "image/png" }),
        new File([jpgBlob], "jacomo-bizboard-1029x258-variant-01.jpg", { type: "image/jpeg" }),
      ];
      const nextOutputs: OutputArtifact[] = [];
      for (const file of rendered) {
        setStatus(`Uploading rendered ${file.name} and verifying Signed GET checksum…`);
        const stored = await uploadAndReadBack(file, "ASSET");
        const bitmap = await decodeImage(stored.readbackBytes, stored.mimeType);
        if (bitmap.width !== CANVAS_WIDTH || bitmap.height !== CANVAS_HEIGHT) {
          bitmap.close();
          throw new Error("RENDER_DIMENSIONS_INVALID");
        }
        bitmap.close();
        nextOutputs.push({
          ...stored,
          downloadFilename: file.name,
          previewUrl: URL.createObjectURL(
            new Blob([ownedArrayBuffer(stored.readbackBytes)], { type: stored.mimeType }),
          ),
        });
      }
      setOutputs(nextOutputs);
      setStatus("PNG and JPG generated, stored, decoded, and checksum verified.");
    } catch (caught) {
      setError(stableError(caught));
      setStatus("Creative generation was rejected; downloads remain disabled.");
    } finally {
      setBusy(false);
    }
  };

  const download = async (output: OutputArtifact) => {
    setBusy(true);
    setError(null);
    try {
      const bytes = await downloadStoredBytes(WORKSPACE_ID, output);
      const url = URL.createObjectURL(
        new Blob([ownedArrayBuffer(bytes)], { type: output.mimeType }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = output.downloadFilename;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setStatus(`${output.downloadFilename} downloaded after Signed GET checksum verification.`);
    } catch (caught) {
      setError(stableError(caught));
    } finally {
      setBusy(false);
    }
  };

  const png = outputs.find((output) => output.mimeType === "image/png");
  const jpg = outputs.find((output) => output.mimeType === "image/jpeg");
  return (
    <section aria-labelledby="user-upload-heading" data-testid="jacomo-user-upload-screen">
      <h1 id="user-upload-heading">JACOMO user upload → real PNG/JPG</h1>
      <p>
        Synthetic QA only · KAKAO_MOMENT / BIZBOARD · {FORMAT_ID} · {PROFILE_VERSION} ·{" "}
        {CANVAS_WIDTH}×{CANVAS_HEIGHT}
      </p>
      <p role="status" data-testid="upload-status">
        {status}
      </p>
      {error ? (
        <p role="alert" data-testid="upload-error">
          {error}
        </p>
      ) : null}
      <fieldset disabled={busy}>
        <legend>1. Upload UTF-8 source text</legend>
        <input
          data-testid="source-file-input"
          type="file"
          accept="text/plain,.txt"
          onChange={(event) => setSourceFile(event.target.files?.[0] ?? null)}
        />
        <button type="button" data-testid="upload-source" onClick={() => void uploadSource()}>
          Upload source
        </button>
        {source ? (
          <p data-testid="source-uploaded">{source.originalFilename} · checksum verified</p>
        ) : null}
      </fieldset>
      <fieldset disabled={busy}>
        <legend>2. Upload one to three product images</legend>
        <input
          data-testid="product-image-input"
          type="file"
          accept="image/png,image/jpeg"
          multiple
          onChange={(event) =>
            setProductFiles(event.target.files ? Array.from(event.target.files) : [])
          }
        />
        <button type="button" data-testid="upload-products" onClick={() => void uploadProducts()}>
          Upload product images
        </button>
        {images.length ? (
          <p data-testid="products-uploaded">{images.length} image checksum(s) verified</p>
        ) : null}
      </fieldset>
      <fieldset disabled={busy || !source || images.length === 0}>
        <legend>3. Generate the real codec outputs</legend>
        <button type="button" data-testid="generate-assets" onClick={() => void generate()}>
          Generate PNG and JPG
        </button>
      </fieldset>
      <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} aria-hidden="true" />
      <section aria-labelledby="output-heading" data-testid="output-section">
        <h2 id="output-heading">Downloads</h2>
        {outputs.map((output) => (
          <figure
            key={output.id}
            data-testid={`output-${output.mimeType === "image/png" ? "png" : "jpg"}`}
          >
            <img
              src={output.previewUrl}
              alt="Generated synthetic creative preview"
              width={514}
              height={129}
            />
            <figcaption>
              {output.downloadFilename} · {output.bytes} bytes · checksum verified
            </figcaption>
            <button type="button" onClick={() => void download(output)}>
              Download {output.mimeType === "image/png" ? "PNG" : "JPG"}
            </button>
          </figure>
        ))}
        {!outputs.length ? <p>No verified output yet.</p> : null}
        {png && jpg ? (
          <p data-testid="output-complete">PNG and JPG ready; browser decode PASS.</p>
        ) : null}
      </section>
    </section>
  );
}
