import type { Sql } from "postgres";
import type {
  IamRepositories,
  InvitationStatus,
  MembershipStatus,
  WorkspaceInvitationRecord,
  WorkspaceMemberRecord,
  WorkspacePolicyRecord,
  WorkspaceRecord,
  WorkspaceRole,
} from "../../../core/src/modules/iam/repositories.js";

interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  status: WorkspaceRecord["status"];
  revision_no: number;
}
interface MemberRow {
  id: string;
  workspace_id: string;
  user_id: string;
  role_code: WorkspaceRole;
  status: MembershipStatus;
  joined_at: Date | null;
}
const mapWorkspace = (row: WorkspaceRow): WorkspaceRecord => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  status: row.status,
  revisionNo: row.revision_no,
});
const mapMember = (row: MemberRow): WorkspaceMemberRecord => ({
  id: row.id,
  workspaceId: row.workspace_id,
  userId: row.user_id,
  roleCode: row.role_code,
  status: row.status,
  ...(row.joined_at ? { joinedAt: row.joined_at } : {}),
});

export class DrizzleIamRepositories implements IamRepositories {
  constructor(private readonly sql: Sql) {}
  async getWorkspace(workspaceId: string) {
    const rows = await this.sql<
      WorkspaceRow[]
    >`SELECT id, name, slug, status, revision_no FROM workspace WHERE id = ${workspaceId} AND deleted_at IS NULL`;
    return rows[0] ? mapWorkspace(rows[0]) : null;
  }
  async updateWorkspace(
    workspaceId: string,
    patch: Partial<Pick<WorkspaceRecord, "name" | "slug" | "status">>,
  ) {
    const rows = await this.sql<
      WorkspaceRow[]
    >`UPDATE workspace SET name = COALESCE(${patch.name ?? null}, name), slug = COALESCE(${patch.slug ?? null}, slug), status = COALESCE(${patch.status ?? null}, status), revision_no = revision_no + 1, updated_at = now() WHERE id = ${workspaceId} AND deleted_at IS NULL RETURNING id, name, slug, status, revision_no`;
    if (!rows[0]) throw new Error("Workspace not found");
    return mapWorkspace(rows[0]);
  }
  async listWorkspacesForUser(userId: string) {
    const rows = await this.sql<
      WorkspaceRow[]
    >`SELECT w.id, w.name, w.slug, w.status, w.revision_no FROM workspace w JOIN workspace_member m ON m.workspace_id = w.id WHERE m.user_id = ${userId} AND m.status = 'ACTIVE' AND w.status = 'ACTIVE' AND w.deleted_at IS NULL ORDER BY w.name`;
    return rows.map(mapWorkspace);
  }
  async getMembership(workspaceId: string, userId: string) {
    const rows = await this.sql<
      MemberRow[]
    >`SELECT id, workspace_id, user_id, role_code, status, joined_at FROM workspace_member WHERE workspace_id = ${workspaceId} AND user_id = ${userId} AND status <> 'REMOVED'`;
    return rows[0] ? mapMember(rows[0]) : null;
  }
  async listMembers(workspaceId: string) {
    const rows = await this.sql<
      MemberRow[]
    >`SELECT id, workspace_id, user_id, role_code, status, joined_at FROM workspace_member WHERE workspace_id = ${workspaceId} AND status <> 'REMOVED' ORDER BY created_at`;
    return rows.map(mapMember);
  }
  async createMembership(input: Omit<WorkspaceMemberRecord, "id"> & { id?: string }) {
    const rows = input.id
      ? await this.sql<
          MemberRow[]
        >`INSERT INTO workspace_member (id, workspace_id, user_id, role_code, status, joined_at) VALUES (${input.id}, ${input.workspaceId}, ${input.userId}, ${input.roleCode}, ${input.status}, ${input.joinedAt ?? null}) RETURNING id, workspace_id, user_id, role_code, status, joined_at`
      : await this.sql<
          MemberRow[]
        >`INSERT INTO workspace_member (workspace_id, user_id, role_code, status, joined_at) VALUES (${input.workspaceId}, ${input.userId}, ${input.roleCode}, ${input.status}, ${input.joinedAt ?? null}) RETURNING id, workspace_id, user_id, role_code, status, joined_at`;
    if (!rows[0]) throw new Error("Workspace membership creation failed");
    return mapMember(rows[0]);
  }
  async updateMembership(
    workspaceId: string,
    memberId: string,
    patch: Partial<Pick<WorkspaceMemberRecord, "roleCode" | "status">>,
  ) {
    if (patch.roleCode && patch.roleCode !== "OWNER") {
      const owners = await this.sql<
        { count: number }[]
      >`SELECT count(*)::int AS count FROM workspace_member WHERE workspace_id = ${workspaceId} AND role_code = 'OWNER' AND status = 'ACTIVE'`;
      if ((owners[0]?.count ?? 0) <= 1)
        throw new Error("The last workspace owner cannot be demoted");
    }
    const rows = await this.sql<
      MemberRow[]
    >`UPDATE workspace_member SET role_code = COALESCE(${patch.roleCode ?? null}, role_code), status = COALESCE(${patch.status ?? null}, status), updated_at = now() WHERE workspace_id = ${workspaceId} AND id = ${memberId} RETURNING id, workspace_id, user_id, role_code, status, joined_at`;
    if (!rows[0]) throw new Error("Workspace membership not found");
    return mapMember(rows[0]);
  }
  async removeMembership(workspaceId: string, memberId: string, actorUserId: string) {
    const rows = await this.sql<
      MemberRow[]
    >`SELECT id, workspace_id, user_id, role_code, status, joined_at FROM workspace_member WHERE id = ${memberId} AND workspace_id = ${workspaceId} FOR UPDATE`;
    const current = rows[0];
    if (!current) throw new Error("Workspace membership not found");
    if (current.role_code === "OWNER") {
      const owners = await this.sql<
        { count: number }[]
      >`SELECT count(*)::int AS count FROM workspace_member WHERE workspace_id = ${workspaceId} AND role_code = 'OWNER' AND status = 'ACTIVE'`;
      if ((owners[0]?.count ?? 0) <= 1)
        throw new Error(
          current.user_id === actorUserId
            ? "The last workspace owner cannot remove themselves"
            : "The last workspace owner cannot be removed",
        );
    }
    await this
      .sql`UPDATE workspace_member SET status = 'REMOVED', updated_at = now() WHERE id = ${memberId} AND workspace_id = ${workspaceId}`;
  }
  async createInvitation(
    input: Omit<WorkspaceInvitationRecord, "id" | "status"> & { id?: string },
  ) {
    const rows = input.id
      ? await this.sql<
          any[]
        >`INSERT INTO workspace_invitation (id, workspace_id, email, role_code, token_hash, status, expires_at, invited_by) VALUES (${input.id}, ${input.workspaceId}, ${input.email}, ${input.roleCode}, ${input.tokenHash}, 'PENDING', ${input.expiresAt}, ${input.invitedBy}) RETURNING *`
      : await this.sql<
          any[]
        >`INSERT INTO workspace_invitation (workspace_id, email, role_code, token_hash, status, expires_at, invited_by) VALUES (${input.workspaceId}, ${input.email}, ${input.roleCode}, ${input.tokenHash}, 'PENDING', ${input.expiresAt}, ${input.invitedBy}) RETURNING *`;
    const row = rows[0];
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      email: row.email,
      roleCode: row.role_code,
      tokenHash: row.token_hash,
      status: row.status as InvitationStatus,
      expiresAt: row.expires_at,
      invitedBy: row.invited_by,
    };
  }
  async getPolicy(workspaceId: string) {
    const rows = await this.sql<
      any[]
    >`SELECT id, workspace_id, self_approval_allowed, retention_days, filename_pattern, policy_json, revision_no FROM workspace_policy WHERE workspace_id = ${workspaceId}`;
    const row = rows[0];
    return row
      ? {
          id: row.id,
          workspaceId: row.workspace_id,
          selfApprovalAllowed: row.self_approval_allowed,
          ...(row.retention_days == null ? {} : { retentionDays: row.retention_days }),
          ...(row.filename_pattern == null ? {} : { filenamePattern: row.filename_pattern }),
          policyJson: row.policy_json,
          revisionNo: row.revision_no,
        }
      : null;
  }
  async upsertPolicy(
    workspaceId: string,
    patch: Omit<Partial<WorkspacePolicyRecord>, "workspaceId" | "id" | "revisionNo">,
  ) {
    const rows = await this.sql<
      any[]
    >`INSERT INTO workspace_policy (workspace_id, self_approval_allowed, retention_days, filename_pattern, policy_json) VALUES (${workspaceId}, ${patch.selfApprovalAllowed ?? false}, ${patch.retentionDays ?? null}, ${patch.filenamePattern ?? null}, ${this.sql.json(JSON.parse(JSON.stringify(patch.policyJson ?? {})))}) ON CONFLICT (workspace_id) DO UPDATE SET self_approval_allowed = EXCLUDED.self_approval_allowed, retention_days = EXCLUDED.retention_days, filename_pattern = EXCLUDED.filename_pattern, policy_json = EXCLUDED.policy_json, revision_no = workspace_policy.revision_no + 1, updated_at = now() RETURNING id, workspace_id, self_approval_allowed, retention_days, filename_pattern, policy_json, revision_no`;
    const row = rows[0];
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      selfApprovalAllowed: row.self_approval_allowed,
      ...(row.retention_days == null ? {} : { retentionDays: row.retention_days }),
      ...(row.filename_pattern == null ? {} : { filenamePattern: row.filename_pattern }),
      policyJson: row.policy_json,
      revisionNo: row.revision_no,
    };
  }
}
