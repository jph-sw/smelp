import type { SpaceRole } from "../../db/types/tables/auth";

/*
  "owner" only needs to list what "admin" doesn't already have
*/
export const SPACE_ROLE_PERMISSIONS: Record<SpaceRole, string[]> = {
	viewer: ["space:read"],
	participant: ["content:read", "content:write"],
	admin: ["members:invite", "members:remove", "space:update"],
	owner: ["space:delete", "space:transfer"],
};

export const SPACE_ROLE_RANK: Record<SpaceRole, number> = {
	viewer: 0,
	participant: 1,
	admin: 2,
	owner: 3,
};

export function permissionsForRole(role: SpaceRole): string[] {
	return Object.entries(SPACE_ROLE_PERMISSIONS)
		.filter(([r]) => SPACE_ROLE_RANK[r as SpaceRole] <= SPACE_ROLE_RANK[role])
		.flatMap(([, permissions]) => permissions);
}

export function matchesPermission(granted: string, requested: string): boolean {
	if (granted === "*") return true;
	if (granted === requested) return true;
	if (granted.endsWith(":*")) {
		return requested.startsWith(granted.slice(0, -1));
	}
	return false;
}
