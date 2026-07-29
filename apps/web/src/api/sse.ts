export interface WorkspaceEvent {
  readonly id: string;
  readonly event: string;
  readonly data: unknown;
}

export interface WorkspaceEventSubscription {
  readonly ready: Promise<void>;
  readonly lastEventId: string | undefined;
  reconnect(): Promise<void>;
  close(): void;
}

export interface WorkspaceEventSubscriptionOptions {
  workspaceId: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
  onEvent: (event: WorkspaceEvent) => void;
  onError?: (error: unknown) => void;
}

function resolveUrl(baseUrl: string, workspaceId: string) {
  return `${baseUrl.replace(/\/$/, "")}/workspaces/${encodeURIComponent(workspaceId)}/events/stream`;
}

function parseData(dataLines: readonly string[]): unknown {
  const text = dataLines.join("\n");
  try { return JSON.parse(text) as unknown; } catch { return text; }
}

function consumeSseText(
  text: string,
  onEvent: (event: WorkspaceEvent) => void,
  currentEvent: { id: string; event: string; data: string[] },
) {
  for (const line of text.split(/\r?\n/)) {
    if (line === "") {
      if (currentEvent.data.length > 0) {
        onEvent({
          id: currentEvent.id,
          event: currentEvent.event || "message",
          data: parseData(currentEvent.data),
        });
      }
      currentEvent.id = "";
      currentEvent.event = "";
      currentEvent.data = [];
      continue;
    }
    if (line.startsWith(":")) continue;
    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    const value = separator === -1 ? "" : line.slice(separator + 1).replace(/^ /, "");
    if (field === "id") currentEvent.id = value;
    if (field === "event") currentEvent.event = value;
    if (field === "data") currentEvent.data.push(value);
  }
}

async function consumeSseResponse(response: Response, onEvent: (event: WorkspaceEvent) => void) {
  const currentEvent = { id: "", event: "", data: [] as string[] };
  if (!response.body) {
    consumeSseText(await response.text(), onEvent, currentEvent);
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    pending += decoder.decode(chunk.value, { stream: true });
    const lastNewline = pending.lastIndexOf("\n");
    if (lastNewline === -1) continue;
    consumeSseText(pending.slice(0, lastNewline + 1), onEvent, currentEvent);
    pending = pending.slice(lastNewline + 1);
  }
  pending += decoder.decode();
  if (pending) consumeSseText(`${pending}\n`, onEvent, currentEvent);
}

export function createWorkspaceEventSubscription({
  workspaceId,
  baseUrl = "/api/v1",
  fetcher = fetch,
  onEvent,
  onError,
}: WorkspaceEventSubscriptionOptions): WorkspaceEventSubscription {
  let closed = false;
  let lastEventId: string | undefined;
  let controller: AbortController | undefined;
  let connection = 0;
  const connect = async () => {
    const currentConnection = ++connection;
    controller?.abort();
    controller = new AbortController();
    const headers = new Headers({ Accept: "text/event-stream" });
    if (lastEventId) headers.set("Last-Event-ID", lastEventId);
    try {
      const response = await fetcher(resolveUrl(baseUrl, workspaceId), {
        method: "GET",
        headers,
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`SSE request failed with status ${response.status}`);
      await consumeSseResponse(response, (event) => {
        if (event.id) lastEventId = event.id;
        onEvent(event);
      });
    } catch (error) {
      const isCurrent = currentConnection === connection;
      const isAbort = error instanceof DOMException && error.name === "AbortError";
      if (isCurrent && !closed && !isAbort) onError?.(error);
    }
  };
  const ready = connect();
  return {
    ready,
    get lastEventId() { return lastEventId; },
    reconnect() { return closed ? Promise.resolve() : connect(); },
    close() { closed = true; controller?.abort(); },
  };
}

export const subscribeToWorkspaceEvents = createWorkspaceEventSubscription;
