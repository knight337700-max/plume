import { createServer, request as upstreamRequest } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const hopByHopHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function safeRequestPath(requestUrl = "/") {
  const rawPath = requestUrl.split("?", 1)[0] || "/";
  try {
    if (decodeURIComponent(rawPath).split("/").includes("..")) return null;
    return new URL(requestUrl, "http://web-runtime.invalid");
  } catch {
    return null;
  }
}

function apiOrigin(value) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" &&
      !parsed.username &&
      !parsed.password &&
      parsed.pathname === "/" &&
      !parsed.search &&
      !parsed.hash
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function proxyHeaders(headers) {
  const result = {};
  const connectionHeaders = new Set(
    String(headers.connection ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  for (const [name, value] of Object.entries(headers)) {
    const normalized = name.toLowerCase();
    if (
      !hopByHopHeaders.has(normalized) &&
      !connectionHeaders.has(normalized) &&
      normalized !== "host" &&
      value !== undefined
    )
      result[name] = value;
  }
  return result;
}

function sendStatic(response, distRoot, pathname) {
  const root = resolve(distRoot);
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = resolve(root, requested);
  if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
    response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    response.end("Bad Request");
    return;
  }
  readFile(filePath)
    .then((body) => {
      response.writeHead(200, {
        "content-type": contentTypes[extname(filePath)] ?? "application/octet-stream",
      });
      response.end(body);
    })
    .catch(async () => {
      try {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(await readFile(resolve(root, "index.html")));
      } catch {
        response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        response.end("Web runtime is unavailable");
      }
    });
}

function sendBadGateway(response) {
  if (!response.headersSent) {
    response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    response.end("API upstream is unavailable");
  }
}

function proxyApi(request, response, origin, requestUrl) {
  if (!origin) return sendBadGateway(response);
  const upstream = upstreamRequest(
    {
      protocol: origin.protocol,
      hostname: origin.hostname,
      port: origin.port || undefined,
      method: request.method,
      path: `${requestUrl.pathname}${requestUrl.search}`,
      headers: proxyHeaders(request.headers),
    },
    (upstreamResponse) => {
      response.writeHead(
        upstreamResponse.statusCode ?? 502,
        proxyHeaders(upstreamResponse.headers),
      );
      upstreamResponse.pipe(response);
    },
  );
  upstream.on("error", () => sendBadGateway(response));
  request.on("aborted", () => upstream.destroy());
  response.on("close", () => {
    if (!response.writableEnded) upstream.destroy();
  });
  request.pipe(upstream);
}

export function createWebRuntimeServer({
  distRoot = "/app/dist",
  apiOrigin: configuredApiOrigin = process.env.API_ORIGIN,
} = {}) {
  const origin = apiOrigin(configuredApiOrigin);
  return createServer((request, response) => {
    const requestUrl = safeRequestPath(request.url);
    if (!requestUrl) {
      response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      response.end("Bad Request");
      return;
    }
    if (requestUrl.pathname === "/api" || requestUrl.pathname.startsWith("/api/"))
      return proxyApi(request, response, origin, requestUrl);
    sendStatic(response, distRoot, requestUrl.pathname);
  });
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  const server = createWebRuntimeServer();
  server.listen(Number(process.env.PORT ?? 8080), "0.0.0.0");
  const close = () => server.close(() => process.exit(0));
  process.once("SIGTERM", close);
  process.once("SIGINT", close);
}
