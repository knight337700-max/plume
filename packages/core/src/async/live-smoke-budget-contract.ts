/**
 * Transport-level ceiling for one durable live-smoke workflow epoch.
 * It covers the provider canary, initial agent calls, retry, and repair calls
 * together. A controlled runtime may impose a lower exact policy cap.
 */
export const LIVE_SMOKE_WORKFLOW_CALL_BUDGET_MAX = 20;
