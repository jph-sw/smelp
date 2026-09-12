import { DB, type tables, Utils } from "@smelp/db";
import { eventBus } from "./bus";

const sql = new DB().sqlite;
const utils = new Utils();

const ACTION_MAP: Record<string, string> = {
	"issue.created": "created",
	"issue.status_changed": "status_changed",
	"issue.assigned": "assigned",
	"comment.created": "commented",
};

eventBus.onAny(async (event) => {
	if (!event.workspaceId) {
		return;
	}

	const [entityType] = event.type.split(".") as [string, string];

	const log: tables["activity_logs"] = {
		id: crypto.randomUUID(),
		workspaceId: event.workspaceId,
		entityType,
		entityId: event.entityId,
		action: ACTION_MAP[event.type] ?? event.type,
		actorId: event.actorId,
		field: "field" in event.payload ? event.payload.field : null,
		oldValue: "oldValue" in event.payload ? event.payload.oldValue : null,
		newValue: "newValue" in event.payload ? event.payload.newValue : null,
		metadata: JSON.stringify(event.payload),
		createdAt: Date.now(),
	};

	utils.logger.debug(`${log.action}\n`, event.payload);

	try {
		await sql`INSERT INTO activity_logs ${sql(log)}`;
	} catch (error) {
		if (error) {
			if (error instanceof Error) {
				utils.logger.fatal(error);
			}
		}
	}
});
