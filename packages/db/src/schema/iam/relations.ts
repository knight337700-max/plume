/**
 * IAM relationship metadata is kept beside the tables so repositories can
 * expose only the relationships owned by this module.
 */
export const iamRelations = Object.freeze({
  workspaceMember: ["workspace", "userAccount"],
  workspaceInvitation: ["workspace", "invitedBy", "acceptedBy"],
  workspacePolicy: ["workspace"],
});

export const relations = iamRelations;
export default iamRelations;
