import { ORPCError } from "@orpc/server";
import { DB, type tables } from "@smelp/db";

const sql = new DB().sqlite;

type Member = tables["auth_space_member"];
type Transaction = (
	strings: TemplateStringsArray,
	...values: unknown[]
) => PromiseLike<unknown>;

async function adminsOf(tx: Transaction, spaceId: string) {
	return (await tx`
		SELECT * FROM auth_space_member
		WHERE spaceId = ${spaceId} AND role = 'admin'
		ORDER BY createdAt ASC
	`) as Member[];
}

export const LAST_ADMIN_MESSAGE =
	"Make someone else an admin first, or delete the workspace.";

// Every workspace needs an admin. Checks inside the transaction so that two admins
// removing each other at the same moment can't leave none.
async function requireAnotherAdmin(
	tx: Transaction,
	spaceId: string,
	member: Member,
	message: string,
) {
	if (member.role !== "admin") return;
	const others = (await adminsOf(tx, spaceId)).filter(
		(admin) => admin.userId !== member.userId,
	);
	if (others.length === 0) {
		throw new ORPCError("BAD_REQUEST", { message });
	}
}

export async function changeWorkspaceRole(
	workspace: tables["workspace"],
	member: Member,
	role: Member["role"],
) {
	await sql.begin(async (tx) => {
		if (role !== "admin") {
			await requireAnotherAdmin(
				tx,
				workspace.spaceId,
				member,
				LAST_ADMIN_MESSAGE,
			);
		}
		await tx`UPDATE auth_space_member SET role = ${role} WHERE id = ${member.id}`;
	});
}

// Project access is stored separately from workspace access, so leaving a workspace
// has to remove all of it. Otherwise a removed member could still open its projects.
export async function removeFromWorkspace(
	workspace: tables["workspace"],
	member: Member,
) {
	await sql.begin(async (tx) => {
		await requireAnotherAdmin(
			tx,
			workspace.spaceId,
			member,
			LAST_ADMIN_MESSAGE,
		);

		await tx`DELETE FROM auth_space_member WHERE id = ${member.id}`;

		// With the last-admin check above, this always finds someone.
		const [successor] = await adminsOf(tx, workspace.spaceId);
		if (!successor) {
			throw new ORPCError("BAD_REQUEST", { message: LAST_ADMIN_MESSAGE });
		}

		const projects = (await tx`
			SELECT id, spaceId FROM project WHERE workspaceId = ${workspace.id}
		`) as Pick<tables["project"], "id" | "spaceId">[];

		for (const project of projects) {
			const membership = (
				await tx`
					SELECT * FROM auth_space_member
					WHERE spaceId = ${project.spaceId} AND userId = ${member.userId}
				`
			)[0] as Member | undefined;
			if (!membership) continue;

			await tx`DELETE FROM auth_space_member WHERE id = ${membership.id}`;

			// A project left with no admin would have nobody able to manage it.
			if ((await adminsOf(tx, project.spaceId)).length === 0) {
				const replacement: Member = {
					id: crypto.randomUUID(),
					spaceId: project.spaceId,
					userId: successor.userId,
					role: "admin",
					createdAt: Date.now(),
				};
				await tx`
					INSERT INTO auth_space_member ${tx(replacement)}
					ON CONFLICT (spaceId, userId) DO UPDATE SET role = 'admin'
				`;
			}

			await tx`
				UPDATE auth_space SET ownerId = ${successor.userId}
				WHERE id = ${project.spaceId} AND ownerId = ${member.userId}
			`;
		}

		await tx`
			UPDATE issue SET assignee = NULL
			WHERE workspaceId = ${workspace.id} AND assignee = ${member.userId}
		`;

		// Links they created shouldn't keep letting people in after they're gone.
		await tx`
			DELETE FROM auth_space_invite
			WHERE spaceId = ${workspace.spaceId}
				AND invitedByUserId = ${member.userId}
				AND acceptedAt IS NULL
		`;

		await tx`
			UPDATE workspace SET ownerId = ${successor.userId}
			WHERE id = ${workspace.id} AND ownerId = ${member.userId}
		`;
		await tx`
			UPDATE auth_space SET ownerId = ${successor.userId}
			WHERE id = ${workspace.spaceId} AND ownerId = ${member.userId}
		`;
	});
}
