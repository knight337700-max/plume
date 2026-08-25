import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createWebRuntimeServer } from "./web-runtime-server.mjs";

async function listen(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
async function close(server) {
  await new Promise((resolve) => server.close(resolve));
}
function call(origin, path, { method = "GET", headers, body } = {}) {
  return new Promise((resolve, reject) => {
    const client = request(new URL(path, origin), { method, headers }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () =>
        resolve({
          status: response.statusCode,
          headers: response.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        }),
      );
    });
    client.on("error", reject);
    if (body) client.write(body);
    client.end();
  });
}

function rawCall(origin, path) {
  return new Promise((resolve, reject) => {
    const url = new URL(origin);
    const client = request({ hostname: url.hostname, port: url.port, path }, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode));
    });
    client.on("error", reject);
    client.end();
  });
}

test("serves static assets, SPA fallback, and rejects traversal", async () => {
  const dist = await mkdtemp(join(tmpdir(), "plume-web-runtime-"));
  await writeFile(join(dist, "index.html"), "<h1>Plume</h1>");
  await writeFile(join(dist, "app.js"), "export const plume = true;");
  const server = createWebRuntimeServer({ distRoot: dist });
  const origin = await listen(server);
  try {
    assert.equal((await call(origin, "/")).body, "<h1>Plume</h1>");
    assert.match((await call(origin, "/app.js")).headers["content-type"], /javascript/);
    assert.equal((await call(origin, "/campaigns/next")).body, "<h1>Plume</h1>");
    assert.equal(await rawCall(origin, "/%2e%2e/etc/passwd"), 400);
  } finally {
    await close(server);
  }
});

test("proxies method, query, body, cookies and response headers without target override", async () => {
  let seen;
  const upstream = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      seen = {
        method: req.method,
        url: req.url,
        cookie: req.headers.cookie,
        host: req.headers.host,
        target: req.headers["x-forward-to"],
      };
      res.writeHead(201, {
        "content-type": "application/json",
        "cache-control": "no-store",
        "set-cookie": "session=opaque; Path=/; HttpOnly",
      });
      res.end(JSON.stringify({ body: Buffer.concat(chunks).toString("utf8") }));
    });
  });
  const upstreamOrigin = await listen(upstream);
  const server = createWebRuntimeServer({
    distRoot: await mkdtemp(join(tmpdir(), "plume-web-runtime-")),
    apiOrigin: upstreamOrigin,
  });
  const origin = await listen(server);
  try {
    const result = await call(origin, "/api/v1/items?cursor=next&target=http://invalid.test", {
      method: "POST",
      headers: {
        cookie: "session=opaque",
        host: "browser.invalid",
        connection: "x-forward-to",
        "x-forward-to": "http://invalid.test",
        "content-type": "application/json",
      },
      body: '{"name":"plume"}',
    });
    assert.equal(result.status, 201);
    assert.deepEqual(result.headers["set-cookie"], ["session=opaque; Path=/; HttpOnly"]);
    assert.equal(result.headers["cache-control"], "no-store");
    assert.equal(result.body, '{"body":"{\\"name\\":\\"plume\\"}"}');
    assert.deepEqual(seen, {
      method: "POST",
      url: "/api/v1/items?cursor=next&target=http://invalid.test",
      cookie: "session=opaque",
      host: new URL(upstreamOrigin).host,
      target: undefined,
    });
  } finally {
    await close(server);
    await close(upstream);
  }
});

test("fails closed for API requests when API_ORIGIN is absent", async () => {
  const server = createWebRuntimeServer({
    distRoot: await mkdtemp(join(tmpdir(), "plume-web-runtime-")),
    apiOrigin: undefined,
  });
  const origin = await listen(server);
  try {
    assert.equal((await call(origin, "/api/v1/health/ready")).status, 502);
  } finally {
    await close(server);
  }
});

test("rejects unsupported HTTPS API_ORIGIN without crashing", async () => {
  const distRoot = await mkdtemp(join(tmpdir(), "plume-web-runtime-"));
  await writeFile(join(distRoot, "index.html"), "<h1>Plume</h1>");
  const server = createWebRuntimeServer({
    distRoot,
    apiOrigin: "https://example.test",
  });
  const origin = await listen(server);
  try {
    assert.equal((await call(origin, "/api/v1/health/ready")).status, 502);
    assert.equal((await call(origin, "/")).status, 200);
    assert.equal((await call(origin, "/api/v1/health/ready")).status, 502);
  } finally {
    await close(server);
  }
});

test("streams SSE chunks before upstream completion", async () => {
  let finish;
  const upstream = createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    res.write("data: first\n\n");
    finish = () => res.end("data: second\n\n");
  });
  const upstreamOrigin = await listen(upstream);
  const server = createWebRuntimeServer({
    distRoot: await mkdtemp(join(tmpdir(), "plume-web-runtime-")),
    apiOrigin: upstreamOrigin,
  });
  const origin = await listen(server);
  try {
    const result = await new Promise((resolve, reject) => {
      const client = request(new URL("/api/v1/workspaces/ws/events/stream", origin), (response) => {
        let body = "";
        response.on("data", (chunk) => {
          body += chunk;
          if (body.includes("first")) {
            assert.match(response.headers["content-type"], /text\/event-stream/);
            finish();
          }
        });
        response.on("end", () => resolve(body));
      });
      client.on("error", reject);
      client.end();
    });
    assert.match(result, /first/);
    assert.match(result, /second/);
  } finally {
    await close(server);
    await close(upstream);
  }
});

test("client abort closes the upstream stream without crashing the proxy", async () => {
  let upstreamClosed = false;
  const upstream = createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write("data: first\n\n");
    res.on("close", () => {
      upstreamClosed = true;
    });
  });
  const upstreamOrigin = await listen(upstream);
  const server = createWebRuntimeServer({
    distRoot: await mkdtemp(join(tmpdir(), "plume-web-runtime-")),
    apiOrigin: upstreamOrigin,
  });
  const origin = await listen(server);
  try {
    await new Promise((resolve, reject) => {
      const client = request(new URL("/api/v1/events", origin), (response) => {
        response.once("data", () => {
          response.destroy();
          resolve();
        });
      });
      client.on("error", reject);
      client.end();
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(upstreamClosed, true);
  } finally {
    await close(server);
    await close(upstream);
  }
});
