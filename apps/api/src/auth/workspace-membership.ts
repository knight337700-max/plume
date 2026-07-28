export type WorkspaceRole = "OWNER" | "ADMIN" | "EDITOR" | "REVIEWER" | "VIEWER";

export interface WorkspaceMembership {
  readonly workspaceId: string;
  readonly userId: string;
  readonly role: WorkspaceRole;
  readonly status: "ACTIVE" | "INVITED" | "SUSPENDED";
}

export interface MembershipStore {
  find(workspaceId: string, userId: string): Promise<WorkspaceMembership | null>;
}

export class InMemoryMembershipStore implements MembershipStore {
  constructor(private readonly memberships: readonly WorkspaceMembership[] = []) {}

  async find(workspaceId: string, userId: string): Promise<WorkspaceMembership | null> {
    return (
      this.memberships.find(
        (item) =>
          item.workspaceId === workspaceId && item.userId === userId && item.status === "ACTIVE",
      ) ?? null
    );
  }
}
