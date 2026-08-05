import { createHash, createHmac, randomUUID } from "node:crypto";

export interface StoragePutInput {
  body: Uint8Array;
  contentType: string;
  objectKey?: string;
  metadata?: Readonly<Record<string, string>>;
}

export interface StorageObject {
  bucket: string;
  objectKey: string;
  bytes: number;
  checksumSha256: string;
  etag: string;
}

export interface StorageHead {
  bucket: string;
  objectKey: string;
  bytes: number;
  contentType?: string;
  etag?: string;
  checksumSha256?: string;
}

export interface PresignedUrl {
  url: string;
  expiresAt: string;
  method: "GET" | "PUT";
}

export interface ObjectStorage {
  createObjectKey(purpose?: string): string;
  put(input: StoragePutInput): Promise<StorageObject>;
  head(objectKey: string): Promise<StorageHead | null>;
  get(objectKey: string): Promise<Uint8Array>;
  presign(
    objectKey: string,
    options?: { method?: "GET" | "PUT"; expiresInSeconds?: number },
  ): Promise<PresignedUrl>;
  deleteTemp(objectKey: string): Promise<void>;
}

export interface S3ObjectStorageOptions {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  clock?: () => Date;
}

type HttpMethod = "GET" | "HEAD" | "PUT" | "DELETE";

const sha256 = (value: string | Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");
const hmac = (key: string | Uint8Array, value: string): Buffer =>
  createHmac("sha256", key).update(value).digest();
const awsEncode = (value: string): string =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

function errorForResponse(response: Response, operation: string): Error {
  const error = new Error(`${operation} failed with HTTP ${response.status}`);
  Object.assign(error, { code: "OBJECT_STORAGE_ERROR", statusCode: response.status });
  return error;
}

export class S3ObjectStorage implements ObjectStorage {
  private readonly endpoint: URL;
  private readonly region: string;
  private bucketEnsured = false;

  public constructor(private readonly options: S3ObjectStorageOptions) {
    this.endpoint = new URL(options.endpoint);
    this.region = options.region ?? "us-east-1";
  }

  public createObjectKey(purpose = "uploads"): string {
    const safePurpose =
      purpose
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/^-+|-+$/g, "") || "uploads";
    return `${safePurpose}/${new Date(this.now()).toISOString().slice(0, 10)}/${randomUUID()}`;
  }

  public async put(input: StoragePutInput): Promise<StorageObject> {
    const objectKey = input.objectKey ?? this.createObjectKey("uploads");
    this.assertSafeObjectKey(objectKey);
    await this.ensureBucket();
    const checksumSha256 = sha256(input.body);
    const headers: Record<string, string> = {
      "content-type": input.contentType,
      "x-amz-content-sha256": checksumSha256,
    };
    for (const [key, value] of Object.entries(input.metadata ?? {}))
      headers[`x-amz-meta-${key.toLowerCase()}`] = value;
    const response = await this.request("PUT", objectKey, headers, input.body);
    if (!response.ok) throw errorForResponse(response, "S3 put");
    return {
      bucket: this.options.bucket,
      objectKey,
      bytes: input.body.byteLength,
      checksumSha256,
      etag: response.headers.get("etag")?.replaceAll('"', "") ?? checksumSha256,
    };
  }

  public async head(objectKey: string): Promise<StorageHead | null> {
    this.assertSafeObjectKey(objectKey);
    const response = await this.request("HEAD", objectKey, {
      "x-amz-content-sha256": sha256(new Uint8Array()),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw errorForResponse(response, "S3 head");
    return {
      bucket: this.options.bucket,
      objectKey,
      bytes: Number(response.headers.get("content-length") ?? 0),
      ...(response.headers.get("content-type")
        ? { contentType: response.headers.get("content-type")! }
        : {}),
      ...(response.headers.get("etag")
        ? { etag: response.headers.get("etag")!.replaceAll('"', "") }
        : {}),
      ...(response.headers.get("x-amz-checksum-sha256")
        ? { checksumSha256: response.headers.get("x-amz-checksum-sha256")! }
        : {}),
    };
  }

  public async get(objectKey: string): Promise<Uint8Array> {
    const signed = await this.presign(objectKey, { method: "GET", expiresInSeconds: 60 });
    const response = await fetch(signed.url);
    if (!response.ok) throw errorForResponse(response, "S3 get");
    return new Uint8Array(await response.arrayBuffer());
  }

  public async checkBucket(): Promise<void> {
    const response = await this.request("HEAD", "", {
      "x-amz-content-sha256": sha256(new Uint8Array()),
    });
    if (!response.ok) throw errorForResponse(response, "S3 bucket readiness");
  }

  public async presign(
    objectKey: string,
    options: { method?: "GET" | "PUT"; expiresInSeconds?: number } = {},
  ): Promise<PresignedUrl> {
    this.assertSafeObjectKey(objectKey);
    const method = options.method ?? "GET";
    const expiresInSeconds = Math.max(
      1,
      Math.min(604800, Math.floor(options.expiresInSeconds ?? 300)),
    );
    const now = this.now();
    const amzDate = this.amzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const credential = `${this.options.accessKeyId}/${dateStamp}/${this.region}/s3/aws4_request`;
    const canonicalUri = this.objectPath(objectKey);
    const query: Record<string, string> = {
      "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
      "X-Amz-Credential": credential,
      "X-Amz-Date": amzDate,
      "X-Amz-Expires": String(expiresInSeconds),
      "X-Amz-SignedHeaders": "host",
    };
    const canonicalQuery = this.canonicalQuery(query);
    const host = this.host();
    const canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQuery}\nhost:${host}\n\nhost\nUNSIGNED-PAYLOAD`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${dateStamp}/${this.region}/s3/aws4_request\n${sha256(canonicalRequest)}`;
    query["X-Amz-Signature"] = this.signature(dateStamp, stringToSign);
    const url = new URL(this.endpoint.toString());
    url.pathname = canonicalUri;
    url.search = this.canonicalQuery(query);
    return {
      url: url.toString(),
      expiresAt: new Date(now.getTime() + expiresInSeconds * 1000).toISOString(),
      method,
    };
  }

  public async deleteTemp(objectKey: string): Promise<void> {
    this.assertSafeObjectKey(objectKey);
    if (
      !objectKey.startsWith("uploads/") &&
      !objectKey.startsWith("temp/") &&
      !/^workspaces\/[a-z0-9-]+\/(?:uploads|temp)\//iu.test(objectKey)
    ) {
      const error = new Error("Only temporary upload objects may be deleted");
      Object.assign(error, { code: "INVALID_TEMP_OBJECT_KEY", statusCode: 400 });
      throw error;
    }
    const response = await this.request("DELETE", objectKey, {
      "x-amz-content-sha256": sha256(new Uint8Array()),
    });
    if (!response.ok && response.status !== 404) throw errorForResponse(response, "S3 delete temp");
  }

  private async ensureBucket(): Promise<void> {
    if (this.bucketEnsured) return;
    const response = await this.request(
      "PUT",
      "",
      { "x-amz-content-sha256": sha256(new Uint8Array()) },
      new Uint8Array(),
    );
    if (!response.ok && response.status !== 409) {
      const detail = await response.text();
      const error = errorForResponse(response, "S3 create bucket");
      error.message += `: ${detail}`;
      throw error;
    }
    this.bucketEnsured = true;
  }

  private async request(
    method: HttpMethod,
    objectKey: string,
    headers: Record<string, string>,
    body?: Uint8Array,
  ): Promise<Response> {
    const payloadHash = headers["x-amz-content-sha256"] ?? sha256(new Uint8Array());
    const path = this.objectPath(objectKey);
    const host = this.host();
    const signedHeaders = { host, ...headers };
    const canonicalHeaderText = Object.entries(signedHeaders)
      .map(([key, value]) => [key.toLowerCase(), value.trim().replace(/\s+/g, " ")] as const)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}:${value}\n`)
      .join("");
    const signedHeaderNames = Object.keys(signedHeaders)
      .map((key) => key.toLowerCase())
      .sort()
      .join(";");
    const canonicalRequest = `${method}\n${path}\n\n${canonicalHeaderText}\n${signedHeaderNames}\n${payloadHash}`;
    const now = this.now();
    const amzDate = this.amzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const scope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256(canonicalRequest)}`;
    const authorization = `AWS4-HMAC-SHA256 Credential=${this.options.accessKeyId}/${scope}, SignedHeaders=${signedHeaderNames}, Signature=${this.signature(dateStamp, stringToSign)}`;
    const requestHeaders = new Headers(headers);
    requestHeaders.set("host", host);
    requestHeaders.set("x-amz-date", amzDate);
    requestHeaders.set("authorization", authorization);
    const url = new URL(this.endpoint.toString());
    url.pathname = path;
    return fetch(url, {
      method,
      headers: requestHeaders,
      ...(body ? { body: body as unknown as ArrayBuffer } : {}),
    });
  }

  private objectPath(objectKey: string): string {
    const basePath = this.endpoint.pathname.replace(/\/$/, "");
    const bucketPath = `/${awsEncode(this.options.bucket)}`;
    const keyPath = objectKey ? `/${objectKey.split("/").map(awsEncode).join("/")}` : "";
    return `${basePath}${bucketPath}${keyPath}` || "/";
  }

  private assertSafeObjectKey(objectKey: string): void {
    if (
      !objectKey ||
      objectKey.startsWith("/") ||
      objectKey.includes("\\") ||
      objectKey.split("/").some((segment) => !segment || segment === "." || segment === "..")
    ) {
      const error = new Error("Object key is invalid");
      Object.assign(error, { code: "INVALID_OBJECT_KEY", statusCode: 422 });
      throw error;
    }
  }

  private host(): string {
    return this.endpoint.host;
  }

  private now(): Date {
    return this.options.clock?.() ?? new Date();
  }

  private amzDate(date: Date): string {
    return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  }

  private canonicalQuery(query: Record<string, string>): string {
    return Object.entries(query)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${awsEncode(key)}=${awsEncode(value)}`)
      .join("&");
  }

  private signature(dateStamp: string, stringToSign: string): string {
    const dateKey = hmac(`AWS4${this.options.secretAccessKey}`, dateStamp);
    const regionKey = hmac(dateKey, this.region);
    const serviceKey = hmac(regionKey, "s3");
    return createHmac("sha256", hmac(serviceKey, "aws4_request"))
      .update(stringToSign)
      .digest("hex");
  }
}
