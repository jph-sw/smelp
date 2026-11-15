import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { CORSPlugin, ResponseHeadersPlugin } from "@orpc/server/plugins";
import "./lib/notifications";
import { logRequestError } from "./lib/request-errors";
import { findIssueActivity } from "./routes/activity";
import { findWorkspaceActivity } from "./routes/activity-feed";
import {
	deleteAttachment,
	findAttachmentLimits,
	findAttachments,
} from "./routes/attachment";
import { me } from "./routes/auth/me";
import {
	findLinkedAccounts,
	findSignInOptions,
	setPassword,
	startOidcLink,
	unlinkOidc,
} from "./routes/auth/oidc";
import {
	changePassword,
	previewPasswordReset,
	requestPasswordReset,
	resetPassword,
} from "./routes/auth/password";
import {
	removeAvatar,
	setAvatar,
	updateNotificationPreferences,
	updateProfile,
} from "./routes/auth/profile";
import { signIn } from "./routes/auth/signin";
import { signOut } from "./routes/auth/signout";
import { signUp } from "./routes/auth/signup";
import {
	resendEmailVerification,
	verifyEmail,
} from "./routes/auth/verify-email";
import {
	createComment,
	deleteComment,
	findComments,
	setReaction,
	updateComment,
} from "./routes/comment";
import {
	createCycle,
	deleteCycle,
	findCycle,
	findCycles,
	moveUnfinishedToCycle,
	updateCycle,
} from "./routes/cycle";
import {
	createPasswordReset,
	findInstanceStatus,
	findInstanceUsers,
	findInstanceVersion,
	markEmailVerifiedByAdmin,
	sendTestEmail,
	updateInstance,
} from "./routes/instance";
import {
	createIssue,
	deleteIssue,
	findIssue,
	updateIssue,
} from "./routes/issue";
import {
	addIssueRelation,
	findIssueRelations,
	removeIssueRelation,
} from "./routes/issue-relation";
import { findIssues, findMyIssues, searchIssues } from "./routes/issues";
import { applyJiraImport, previewJiraImport } from "./routes/jira-import";
import { createLink, deleteLink, findLinks, updateLink } from "./routes/link";
import {
	createModule,
	deleteModule,
	findModule,
	findModules,
	updateModule,
} from "./routes/module";
import {
	countUnreadNotifications,
	findNotifications,
	markAllNotificationsRead,
	markIssueNotificationRead,
	markNotificationRead,
} from "./routes/notifications";
import {
	archiveProject,
	createProject,
	deleteProject,
	findProject,
	joinProject,
	removeBackground,
	setBackground,
	unarchiveProject,
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
import {
	findWorkspaceMembers,
	leaveWorkspace,
	removeWorkspaceMember,
	updateWorkspaceMemberRole,
} from "./routes/workspace-members";
import { findWorkspaces } from "./routes/workspaces";

export const router = {
	instance: {
		status: findInstanceStatus,
		update: updateInstance,
		users: findInstanceUsers,
		version: findInstanceVersion,
		createPasswordReset,
		sendTestEmail,
		markEmailVerified: markEmailVerifiedByAdmin,
	},
	auth: {
		signIn,
		signUp,
		signOut,
		me,
		signInOptions: findSignInOptions,
		linkedAccounts: findLinkedAccounts,
		unlinkOidc,
		startOidcLink,
		setPassword,
		previewPasswordReset,
		resetPassword,
		requestPasswordReset,
		changePassword,
		updateProfile,
		setAvatar,
		removeAvatar,
		updateNotificationPreferences,
		verifyEmail,
		resendEmailVerification,
	},
	workspace: {
		find: findWorkspace,
		create: createWorkspace,
		update: updateWorkspace,
		delete: deleteWorkspace,
	},
	workspaceMembers: {
		find: findWorkspaceMembers,
		remove: removeWorkspaceMember,
		updateRole: updateWorkspaceMemberRole,
		leave: leaveWorkspace,
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
		archive: archiveProject,
		unarchive: unarchiveProject,
		setBackground,
		removeBackground,
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
	issueRelations: {
		find: findIssueRelations,
		add: addIssueRelation,
		remove: removeIssueRelation,
	},
	issues: {
		find: findIssues,
		findMine: findMyIssues,
		search: searchIssues,
	},
	jiraImport: {
		preview: previewJiraImport,
		apply: applyJiraImport,
	},
	links: {
		find: findLinks,
		create: createLink,
		update: updateLink,
		delete: deleteLink,
	},
	modules: {
		find: findModules,
		get: findModule,
		create: createModule,
		update: updateModule,
		delete: deleteModule,
	},
	comments: {
		find: findComments,
		create: createComment,
		update: updateComment,
		delete: deleteComment,
		setReaction,
	},
	attachments: {
		find: findAttachments,
		limits: findAttachmentLimits,
		delete: deleteAttachment,
	},
	activity: {
		findForIssue: findIssueActivity,
		findWorkspace: findWorkspaceActivity,
	},
	notifications: {
		find: findNotifications,
		countUnread: countUnreadNotifications,
		markRead: markNotificationRead,
		markAllRead: markAllNotificationsRead,
		markReadForIssue: markIssueNotificationRead,
	},
	states: {
		find: findStates,
	},
	cycles: {
		find: findCycles,
		findOne: findCycle,
		create: createCycle,
		update: updateCycle,
		delete: deleteCycle,
		moveUnfinished: moveUnfinishedToCycle,
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
		onError((error, { request }) => {
			logRequestError(error, request.url);
		}),
	],
});
