import type { AppendWorkspaceEventInput, WorkspaceEvent, WorkspaceEventStream } from "../../../../../packages/infrastructure/src/events/redis-workspace-stream.js";

export interface WorkspaceEventProjectionInput extends AppendWorkspaceEventInput {}

export function createWorkspaceEventProjector(stream: WorkspaceEventStream) {
  return { project(input: WorkspaceEventProjectionInput): Promise<WorkspaceEvent> { return stream.append(input); } };
}

