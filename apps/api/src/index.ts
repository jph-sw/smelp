import { Auth } from "@smelp/auth";
import { Utils } from "@smelp/db";
import { Migrator } from "@smelp/migrate";
import { MeHandler } from "./routes/auth/me";
import { SignInHandler } from "./routes/auth/signin";
import { SignUpHandler } from "./routes/auth/signup";
import {
	GetWorkspaceHandler,
	GetWorkspacesHandler,
	PostWorkspacesHandler,
} from "./routes/workspace";

const migrator = new Migrator();
const auth = new Auth();
const utils = new Utils();

await migrator.up();

await auth.createAuthSession("test_user");

const server = Bun.serve({
	routes: {
		"/api/status": new Response("OK"),
		"/api/auth/signin": {
			POST: SignInHandler,
		},
		"/api/auth/signup": {
			POST: SignUpHandler,
		},
		"/api/auth/me": {
			GET: MeHandler,
		},
		"/api/workspaces": {
			GET: GetWorkspacesHandler,
			POST: PostWorkspacesHandler,
		},
		"/api/workspace": {
			GET: GetWorkspaceHandler,
		},
	},
});

utils.logger.info(`𖹭 Server running at ${server.url}`);
