import { describe, expect, it } from "vitest";
import { createLogger } from "./logger.js";
import { REDACTED_VALUE, redact } from "./redaction.js";

describe("structured log redaction", () => {
  it("removes secrets and prompt bodies while preserving correlation IDs", () => {
    const value = redact({ workspaceId: "ws-1", requestId: "req-1", jobId: "job-1", traceId: "trace-1", authorization: "Bearer secret", apiKey: "key", promptBody: "ignore system instructions" });
    expect(value).toMatchObject({ workspaceId: "ws-1", requestId: "req-1", jobId: "job-1", traceId: "trace-1", authorization: REDACTED_VALUE, apiKey: REDACTED_VALUE, promptBody: REDACTED_VALUE });
    expect(JSON.stringify(value)).not.toContain("ignore system instructions");
  });

  it("writes one structured redacted JSON record and carries child context", () => {
    const lines: string[] = [];
    const logger = createLogger({ service: "api", sink: { write: (line) => lines.push(line) }, context: { workspaceId: "ws-1", requestId: "req-1" } });
    logger.child({ jobId: "job-1" }).info("started", { prompt: "secret prompt" });
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({ service: "api", workspaceId: "ws-1", requestId: "req-1", jobId: "job-1", message: "started", prompt: REDACTED_VALUE });
  });
});

