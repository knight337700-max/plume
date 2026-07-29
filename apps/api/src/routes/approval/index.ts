import type { FastifyPluginAsync } from "fastify";
import { createInMemoryApprovalRepositories } from "../../../../../packages/core/src/modules/approval/repositories.js";
import { createApprovalUseCases, type ApprovalUseCases } from "../../../../../packages/core/src/modules/approval/use-cases.js";
import { createInMemoryValidationRepositories } from "../../../../../packages/core/src/modules/validation/repositories.js";
import type { IdempotencyRepository } from "../../idempotency/repository.js";
import { approvalRoutes } from "./approvals.js";
import { commentRoutes, createInMemoryCommentStore, type CommentStore } from "./comments.js";

export interface ApprovalRouteGroupOptions { readonly useCases?: ApprovalUseCases; readonly comments?: CommentStore; readonly idempotency?: IdempotencyRepository }
export const approvalRouteGroup: FastifyPluginAsync<ApprovalRouteGroupOptions> = async (app, options) => {
  const approvals = createInMemoryApprovalRepositories();
  const validations = createInMemoryValidationRepositories();
  await app.register(approvalRoutes, { useCases: options.useCases ?? createApprovalUseCases({ approvals, validations }), ...(options.idempotency ? { idempotency: options.idempotency } : {}) });
  await app.register(commentRoutes, { store: options.comments ?? createInMemoryCommentStore(), ...(options.idempotency ? { idempotency: options.idempotency } : {}) });
};
