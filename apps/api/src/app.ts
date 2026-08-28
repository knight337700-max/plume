import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { authRoutes } from "./routes/auth/index.js";
import { registerHealthRoute, type ReadinessChecks } from "./routes/system/health.js";
import { workspaceRoutes } from "./routes/workspace/index.js";
import { clientBrandRoutes } from "./routes/client-brand/index.js";
import { mediaCatalogRoutes } from "./routes/media-catalog/index.js";
import { assetFileRoutes, assetRoutesGroup } from "./routes/asset/index.js";
import { campaignRouteGroup } from "./routes/campaign/index.js";
import type { DurableFormatBinding } from "../../../packages/infrastructure/src/db/project-format-binding-resolver.js";
import { projectRouteGroup } from "./routes/project/index.js";
import { creativeRouteGroup } from "./routes/creative/index.js";
import { validationRouteGroup } from "./routes/validation/index.js";
import { approvalRouteGroup } from "./routes/approval/index.js";
import { exportRouteGroup } from "./routes/export/index.js";
import { operationsRouteGroup } from "./routes/operations/index.js";
import { installTracingHooks } from "./plugins/tracing.js";
import { registerMetricsRoute } from "./routes/system/metrics.js";
import { registerDashboardRoute } from "./routes/system/dashboard.js";
import type { AsyncCommandPublisher } from "../../../packages/core/src/async/command-publisher.js";
import type { JobUseCases } from "../../../packages/core/src/modules/operations/job-use-cases.js";
import type { SessionUseCases } from "../../../packages/core/src/modules/iam/session-use-cases.js";
import type { MembershipStore } from "./auth/workspace-membership.js";
import type { UploadUseCases } from "../../../packages/core/src/modules/asset/upload-use-cases.js";
import {
  createInMemoryAssetRepositories,
  type AssetRepositories,
} from "../../../packages/core/src/modules/asset/repositories.js";
import {
  createInMemoryCampaignRepositories,
  type CampaignRepositories,
} from "../../../packages/core/src/modules/campaign/repositories.js";
import {
  createInMemoryCreativeRepositories,
  type CreativeRepositories,
} from "../../../packages/core/src/modules/creative/repositories.js";
import {
  createInMemoryProjectRepositories,
  type ProjectRepositories,
} from "../../../packages/core/src/modules/project/repositories.js";
import type {
  ProjectAssetContext,
  ProjectCampaignContext,
} from "../../../packages/core/src/modules/project/project-use-cases.js";
import type { PreparedProjectGeneration } from "../../../packages/core/src/modules/project/project-generation-preparer.js";
import type { ClientBrandRepositories } from "../../../packages/core/src/modules/client-brand/repositories.js";
import { sessionPlugin } from "./plugins/session.js";
import { csrfPlugin } from "./plugins/csrf.js";
import { authorizationPlugin } from "./plugins/authorization.js";
import { workspaceGuardPlugin } from "./plugins/workspace-guard.js";
import { createRateLimitPlugin, type RateLimitPluginOptions } from "./plugins/rate-limit.js";

export interface BuildAppOptions extends FastifyServerOptions {
  readonly readinessChecks?: ReadinessChecks;
  readonly asyncCommandPublisher?: AsyncCommandPublisher;
  readonly jobs?: JobUseCases;
  readonly securityMode?: "test" | "production";
  readonly sessions?: SessionUseCases;
  readonly memberships?: MembershipStore;
  readonly uploads?: UploadUseCases;
  /** Shared aggregate seams used by the real-process E2E and worker composition. */
  readonly campaignRepositories?: CampaignRepositories;
  readonly assetRepositories?: AssetRepositories;
  readonly creativeRepositories?: CreativeRepositories;
  readonly projectRepositories?: ProjectRepositories;
  readonly projectCampaignContext?: ProjectCampaignContext;
  readonly projectAssetContext?: ProjectAssetContext;
  readonly projectCreativeQueries?: Pick<
    CreativeRepositories,
    "listCreativeSetsByProject" | "listAssetUsageGraph"
  >;
  readonly projectGenerationPreparer?: {
    prepare(input: {
      workspaceId: string;
      campaignId: string;
      projectId: string;
      briefVersionId?: string;
    }): Promise<PreparedProjectGeneration>;
  };
  readonly projectFormatBindings?: {
    resolve(
      workspaceId: string,
      campaignId: string,
      formatSelectionIds: readonly string[],
    ): Promise<readonly DurableFormatBinding[]>;
  };
  readonly clientBrandRepositories?: ClientBrandRepositories;
  readonly sessionSecret?: string;
  readonly cookieSecure?: boolean;
  readonly cookieSameSite?: "lax" | "strict" | "none";
  readonly rateLimit?: RateLimitPluginOptions;
  readonly publicMetrics?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const {
    readinessChecks,
    asyncCommandPublisher,
    jobs,
    securityMode = "test",
    sessions,
    memberships,
    uploads,
    campaignRepositories,
    assetRepositories,
    creativeRepositories,
    projectRepositories,
    projectCampaignContext,
    projectAssetContext,
    projectCreativeQueries,
    projectGenerationPreparer,
    projectFormatBindings,
    clientBrandRepositories,
    sessionSecret,
    cookieSecure,
    cookieSameSite,
    rateLimit,
    publicMetrics = securityMode !== "production",
    ...fastifyOptions
  } = options;
  if (
    securityMode === "production" &&
    (!sessions ||
      !memberships ||
      !uploads ||
      !projectRepositories ||
      !projectCampaignContext ||
      !projectAssetContext ||
      !projectCreativeQueries ||
      !projectGenerationPreparer ||
      !sessionSecret ||
      !rateLimit ||
      fastifyOptions.bodyLimit === undefined)
  )
    throw new Error("PRODUCTION_COMPOSITION_INCOMPLETE");
  const app = Fastify({
    logger: false,
    bodyLimit: fastifyOptions.bodyLimit ?? 1_048_576,
    rewriteUrl: (request) => (request.url ?? "/").replace(/:([a-z][a-z-]*)(?=\/|$)/g, ".$1"),
    ...fastifyOptions,
  });
  const resolvedCampaignRepositories = campaignRepositories ?? createInMemoryCampaignRepositories();
  const resolvedAssetRepositories = assetRepositories ?? createInMemoryAssetRepositories();
  const resolvedCreativeRepositories = creativeRepositories ?? createInMemoryCreativeRepositories();
  const resolvedProjectRepositories = projectRepositories ?? createInMemoryProjectRepositories();
  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });
  await installTracingHooks(app);
  await registerHealthRoute(app, readinessChecks ? { readinessChecks } : {});
  await registerMetricsRoute(app, undefined, { publicAccess: publicMetrics });
  await registerDashboardRoute(app);
  const registerRoutes = async (router: FastifyInstance): Promise<void> => {
    await router.register(authRoutes, sessions ? { sessions } : {});
    await router.register(workspaceRoutes);
    await router.register(
      clientBrandRoutes,
      clientBrandRepositories ? { repositories: clientBrandRepositories } : {},
    );
    await router.register(mediaCatalogRoutes);
    await router.register(assetFileRoutes, uploads ? { uploads } : {});
    await router.register(assetRoutesGroup, { repositories: resolvedAssetRepositories });
    await router.register(campaignRouteGroup, {
      repositories: resolvedCampaignRepositories,
      projectRepositories: resolvedProjectRepositories,
      assetRepositories: resolvedAssetRepositories,
      creativeRepositories: resolvedCreativeRepositories,
      ...(projectGenerationPreparer ? { projectGenerationPreparer } : {}),
      ...(projectFormatBindings ? { projectFormatBindings } : {}),
      ...(asyncCommandPublisher ? { asyncCommands: asyncCommandPublisher } : {}),
    });
    await router.register(projectRouteGroup, {
      projects: resolvedProjectRepositories,
      ...(projectCampaignContext ? { campaignContext: projectCampaignContext } : {}),
      ...(projectAssetContext ? { assetContext: projectAssetContext } : {}),
      creatives: projectCreativeQueries ?? resolvedCreativeRepositories,
    });
    await router.register(creativeRouteGroup, {
      repositories: resolvedCreativeRepositories,
      ...(asyncCommandPublisher ? { asyncCommands: asyncCommandPublisher } : {}),
    });
    await router.register(validationRouteGroup, {
      ...(asyncCommandPublisher ? { asyncCommands: asyncCommandPublisher } : {}),
    });
    await router.register(approvalRouteGroup);
    await router.register(exportRouteGroup, {
      ...(asyncCommandPublisher ? { asyncCommands: asyncCommandPublisher } : {}),
    });
    await router.register(operationsRouteGroup, { ...(jobs ? { jobs } : {}) });
  };
  if (securityMode === "production") {
    await app.register(async (secured) => {
      await sessionPlugin(secured, {
        secret: sessionSecret!,
        environment: "production",
        ...(cookieSecure === undefined ? {} : { cookieSecure }),
        ...(cookieSameSite === undefined ? {} : { cookieSameSite }),
      });
      await createRateLimitPlugin(rateLimit!)(secured, {});
      await csrfPlugin(secured, {});
      await workspaceGuardPlugin(secured, { memberships: memberships! });
      await authorizationPlugin(secured, {});
      await registerRoutes(secured);
    });
  } else {
    await registerRoutes(app);
  }
  return app;
}
