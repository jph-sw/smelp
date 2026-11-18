import { Utils } from "@smelp/db";
import nodemailer from "nodemailer";

// Email is optional. It turns on when SMTP_HOST, SMTP_FROM and APP_URL are all set.
//
//   SMTP_HOST         mail server
//   SMTP_FROM         sender, for example "smelp <smelp@example.com>"
//   APP_URL           public address of this install, used in emailed links
//   SMTP_PORT         defaults to 587
//   SMTP_USER         login, if the server needs one
//   SMTP_PASSWORD     password for SMTP_USER
//   SMTP_SECURE       "true" for TLS from the first byte; defaults to true on port 465
//   SMTP_REQUIRE_TLS  "false" allows an unencrypted connection, for a local relay

const utils = new Utils();

function readConfig() {
	const env = process.env;
	const required = {
		SMTP_HOST: env.SMTP_HOST,
		SMTP_FROM: env.SMTP_FROM,
		APP_URL: env.APP_URL,
	};
	const missing = Object.entries(required)
		.filter(([, value]) => !value)
		.map(([name]) => name);
	if (!required.SMTP_HOST || !required.SMTP_FROM || !required.APP_URL) {
		return { config: null, missing };
	}

	const port = Number(env.SMTP_PORT || 587);
	return {
		missing,
		config: {
			host: required.SMTP_HOST,
			from: required.SMTP_FROM,
			appUrl: required.APP_URL.replace(/\/+$/, ""),
			port,
			user: env.SMTP_USER,
			password: env.SMTP_PASSWORD,
			secure: env.SMTP_SECURE ? env.SMTP_SECURE === "true" : port === 465,
			requireTls: env.SMTP_REQUIRE_TLS !== "false",
		},
	};
}

export const isMailEnabled = () => readConfig().config !== null;

export function logMailStatus() {
	const { config, missing } = readConfig();
	if (config) {
		utils.logger.info(`Email is on, using ${config.host}:${config.port}`);
	} else if (process.env.SMTP_HOST || process.env.SMTP_FROM) {
		utils.logger.warn(`Email is off: ${missing.join(", ")} not set`);
	}
}

export async function sendMailOrThrow(message: {
	to: string;
	subject: string;
	text: string;
}) {
	const { config } = readConfig();
	if (!config) throw new Error("Email isn't set up");

	const transport = nodemailer.createTransport({
		host: config.host,
		port: config.port,
		secure: config.secure,
		// Never sends a login or a secret link over a connection that can be read.
		requireTLS: !config.secure && config.requireTls,
		auth: config.user
			? { user: config.user, pass: config.password }
			: undefined,
		// A slow mail server shouldn't leave someone waiting on a form for minutes.
		connectionTimeout: 10_000,
		greetingTimeout: 10_000,
		socketTimeout: 20_000,
	});
	try {
		await transport.sendMail({ from: config.from, ...message });
	} finally {
		transport.close();
	}
}

// "none" means no email was attempted, so the link is the only way to pass it on.
export type EmailDelivery = "sent" | "failed" | "none";

async function deliver(message: {
	to: string;
	subject: string;
	text: string;
}): Promise<EmailDelivery> {
	try {
		await sendMailOrThrow(message);
		return "sent";
	} catch (error) {
		// Only the error: the message itself holds a secret link.
		utils.logger.error(
			`Couldn't send email: ${error instanceof Error ? error.message : error}`,
		);
		return "failed";
	}
}

// Names come from users, so they can't be allowed to add lines to an email.
const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

export async function sendInviteEmail(invite: {
	to: string;
	workspaceName: string;
	inviterName: string;
	token: string;
}): Promise<EmailDelivery> {
	const { config } = readConfig();
	if (!config) return "none";

	const workspaceName = oneLine(invite.workspaceName);
	return deliver({
		to: invite.to,
		subject: `Join ${workspaceName} on smelp`,
		text: [
			`${oneLine(invite.inviterName)} invited you to the ${workspaceName} workspace on smelp.`,
			"",
			"Accept the invite:",
			`${config.appUrl}/invite/${invite.token}`,
			"",
			"This link works once and expires in 7 days.",
		].join("\n"),
	});
}

export async function sendPasswordResetEmail(reset: {
	to: string;
	token: string;
}): Promise<EmailDelivery> {
	const { config } = readConfig();
	if (!config) return "none";

	return deliver({
		to: reset.to,
		subject: "Reset your smelp password",
		text: [
			"Choose a new password for your smelp account:",
			`${config.appUrl}/reset-password/${reset.token}`,
			"",
			"This link works once and expires in 24 hours.",
			"If you didn't ask for this, you can ignore this email.",
		].join("\n"),
	});
}

export async function sendEmailVerificationEmail(verification: {
	to: string;
	token: string;
}): Promise<EmailDelivery> {
	const { config } = readConfig();
	if (!config) return "none";

	return deliver({
		to: verification.to,
		subject: "Confirm your email address for smelp",
		text: [
			"Confirm your email address to start using your smelp account:",
			`${config.appUrl}/verify-email/${verification.token}`,
			"",
			"This link works once and expires in 24 hours.",
			"If you didn't create a smelp account, you can ignore this email.",
		].join("\n"),
	});
}

export async function sendNotificationEmail(notification: {
	to: string;
	workspaceId: string;
	issueId: string;
	commentId?: string | null;
	summary: string;
	actorName: string;
	excerpt?: string;
}): Promise<EmailDelivery> {
	const { config } = readConfig();
	if (!config) return "none";

	const commentSearch = notification.commentId
		? `?comment=${encodeURIComponent(notification.commentId)}`
		: "";
	return deliver({
		to: notification.to,
		subject: oneLine(notification.summary),
		text: [
			oneLine(notification.summary),
			...(notification.excerpt
				? [
						"",
						`${oneLine(notification.actorName)} wrote:`,
						...notification.excerpt.split(/\r?\n/).map((line) => `> ${line}`),
					]
				: []),
			"",
			`${config.appUrl}/${notification.workspaceId}/browse/${notification.issueId}${commentSearch}`,
			"",
			"You get this because you turned on email notifications in your account settings.",
		].join("\n"),
	});
}
