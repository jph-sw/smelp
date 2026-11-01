import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { CORSPlugin, ResponseHeadersPlugin } from "@orpc/server/plugins";
import { findIssueActivity } from "./routes/activity";
import { me } from "./routes/auth/me";
import { signIn } from "./routes/auth/signin";
import { signOut } from "./routes/auth/signout";
import { signUp } from "./routes/auth/signup";
import { createComment, deleteComment, findComments } from "./routes/comment";
import {
	findInstanceStatus,
	findInstanceUsers,
	updateInstance,
} from "./routes/instance";
import {
	createIssue,
	deleteIssue,
	findIssue,
	updateIssue,
} from "./routes/issue";
import { findIssues, findMyIssues } from "./routes/issues";
import {
	createProject,
	deleteProject,
	findProject,
	joinProject,
	updateProject,
} from "./routes/project";
import {
	addProjectMember,
	findAvailableProjectMembers,
	findProjectMembers,
	removeProjectMember,
} from "./routes/project-members";
import { findProjects } from "./routes/projects";
import {
	createState,
	deleteState,
	reorderStates,
	updateState,
} from "./routes/state";
import { findStates } from "./routes/states";
import {
	createWorkspace,
	deleteWorkspace,
	findWorkspace,
	updateWorkspace,
} from "./routes/workspace";
import {
	acceptInvite,
	cancelInvite,
	createInvite,
	findInvites,
	previewInvite,
} from "./routes/workspace-invites";
import { findWorkspaceMembers } from "./routes/workspace-members";
import { findWorkspaces } from "./routes/workspaces";

export const router = {
	instance: {
		status: findInstanceStatus,
		update: updateInstance,
		users: findInstanceUsers,
	},
	auth: {
		signIn,
		signUp,
		signOut,
		me,
	},
	workspace: {
		find: findWorkspace,
		create: createWorkspace,
		update: updateWorkspace,
		delete: deleteWorkspace,
	},
	workspaceMembers: {
		find: findWorkspaceMembers,
	},
	workspaceInvites: {
		create: createInvite,
		find: findInvites,
		preview: previewInvite,
		cancel: cancelInvite,
		accept: acceptInvite,
	},
	workspaces: {
		find: findWorkspaces,
	},
	projects: {
		find: findProjects,
	},
	project: {
		find: findProject,
		create: createProject,
		delete: deleteProject,
		join: joinProject,
		update: updateProject,
	},
	projectMembers: {
		find: findProjectMembers,
		findAvailable: findAvailableProjectMembers,
		add: addProjectMember,
		remove: removeProjectMember,
	},
	issue: {
		find: findIssue,
		create: createIssue,
		update: updateIssue,
		delete: deleteIssue,
	},
	issues: {
		find: findIssues,
		findMine: findMyIssues,
	},
	comments: {
		find: findComments,
		create: createComment,
		delete: deleteComment,
	},
	activity: {
		findForIssue: findIssueActivity,
	},
	states: {
		find: findStates,
	},
	state: {
		create: createState,
		update: updateState,
		delete: deleteState,
		reorder: reorderStates,
	},
};

export type AppRouter = typeof router;

// The web app is same-origin (through the Vite proxy in development), so no
// cross-origin caller is allowed unless it is listed here.
const allowedOrigins = (process.env.CORS_ORIGINS ?? "")
	.split(",")
	.map((origin) => origin.trim())
	.filter(Boolean);

export const handler = new RPCHandler(router, {
	plugins: [
		new CORSPlugin({
			credentials: true,
			origin: (origin) => (allowedOrigins.includes(origin) ? origin : []),
		}),
		new ResponseHeadersPlugin(),
	],
	interceptors: [
		onError((error) => {
			console.error(error);
		}),
	],
});
