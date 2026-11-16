import type { SpaceRole } from "../../db/types/tables/auth";

/*
  "owner" only needs to list what "admin" doesn't already have
*/
export const SPACE_ROLE_PERMISSIONS = {
	guest: ["space:read"],
	member: ["content:read", "content:write"],
	admin: [
		"members:invite",
		"members:remove",
		"space:update",
		"space:delete",
		"space:transfer",
	],
} as const satisfies Record<SpaceRole, string[]>;

export type Permission =
	(typeof SPACE_ROLE_PERMISSIONS)[keyof typeof SPACE_ROLE_PERMISSIONS][number];

export const SPACE_ROLE_RANK: Record<SpaceRole, number> = {
	guest: 0,
	member: 1,
	admin: 2,
};

export function permissionsForRole(role: SpaceRole): Permission[] {
	return Object.entries(SPACE_ROLE_PERMISSIONS)
		.filter(([r]) => SPACE_ROLE_RANK[r as SpaceRole] <= SPACE_ROLE_RANK[role])
		.flatMap(([, permissions]) => permissions) as Permission[];
}

export function matchesPermission(
	granted: Permission,
	requested: Permission,
): boolean {
	if (granted === requested) return true;
	if (granted.endsWith(":*")) {
		return requested.startsWith(granted.slice(0, -1));
	}
	return false;
}

export function roleHasPermission(role: SpaceRole, permission: Permission) {
	return permissionsForRole(role).some((granted) =>
		matchesPermission(granted, permission),
	);
}
