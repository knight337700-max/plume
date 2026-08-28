import { AsyncLocalStorage } from "node:async_hooks";
import type { Sql } from "postgres";
import type { ObjectStorage } from "../../../packages/infrastructure/src/storage/s3-object-storage.js";
import {
  ProjectRenderArtifactPersistence,
  type ProjectRenderArtifactContext,
  type ProjectRenderArtifactOutcome,
} from "../../../packages/infrastructure/src/db/project-render-artifact-persistence.js";
import type { DurableWorkflowRepository } from "../../../packages/infrastructure/src/async/durable-workflow-repository.js";

const renderArtifactContext = new AsyncLocalStorage<ProjectRenderArtifactContext>();

export function currentProjectRenderArtifactContext(): ProjectRenderArtifactContext | undefined {
  return renderArtifactContext.getStore();
}

export function runProjectRenderArtifactContext<T>(
  context: ProjectRenderArtifactContext,
  callback: () => Promise<T> | T,
): Promise<T> | T {
  return renderArtifactContext.run(Object.freeze(context), callback);
}

export interface ProjectRenderArtifactWorkflowOptions {
  readonly workflow: DurableWorkflowRepository;
  readonly sql: Sql;
  readonly storage: ObjectStorage;
  /** Test-only failure seam; production composition leaves it undefined. */
  readonly beforeRenderInsert?: () => Promise<void> | void;
}

/**
 * Decorates only the workflow completion boundary. The Frozen handler still
 * owns rendering and object storage writes; Project jobs must durably persist
 * the FileObject/CreativeRender graph before their workflow item completes.
 */
export function createProjectRenderArtifactWorkflow(
  options: ProjectRenderArtifactWorkflowOptions,
): DurableWorkflowRepository {
  const persistence = new ProjectRenderArtifactPersistence(options.sql, options.storage, {
    ...(options.beforeRenderInsert ? { beforeRenderInsert: options.beforeRenderInsert } : {}),
  });
  return new Proxy(options.workflow, {
    get(target, property, receiver) {
      if (property !== "completeItem") {
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      }
      return async (
        workspaceId: string,
        jobId: string,
        jobItemId: string,
        result: unknown,
      ): Promise<void> => {
        const context = currentProjectRenderArtifactContext();
        if (!context) {
          await target.completeItem(workspaceId, jobId, jobItemId, result);
          return;
        }
        if (
          context.workspaceId !== workspaceId ||
          context.jobId !== jobId ||
          context.jobItemId !== jobItemId
        )
          throw Object.assign(
            new Error("Project render workflow context does not match completion"),
            {
              code: "PROJECT_RENDER_ARTIFACT_CONTEXT_MISMATCH",
            },
          );
        await persistence.persist(context, result as ProjectRenderArtifactOutcome);
        await target.completeItem(workspaceId, jobId, jobItemId, result);
      };
    },
  }) as DurableWorkflowRepository;
}
