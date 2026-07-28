export const operationsRelations = Object.freeze({
  asyncJob: ["workspace", "requestedBy"],
  asyncJobItem: ["workspace", "asyncJob"],
  activityEvent: ["workspace", "actor"],
  auditLog: ["workspace", "actor"],
  notification: ["workspace", "user", "event"],
});

export const relations = operationsRelations;
export default operationsRelations;
