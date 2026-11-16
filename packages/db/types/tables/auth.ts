export type auth_session = {
	id: string;
	userId: string;
	secretHash: Uint8Array;
	tokenLastVerifiedAt: number;
	createdAt: number;
};

export type auth_user = {
	id: string;
	fullName: string;
	displayName: string;
	email: string;
	role: string | null;
	image: string | null;
	/** 1 when they asked for notification emails; off (0) by default. */
	notifyByEmail: number;
	/** 0 until they confirm the address, for public sign-ups on an instance with email. */
	emailVerified: number;
	createdAt: number;
	updatedAt: number;
};

export type auth_account = {
	id: string;
	userId: string;
	accountId: string;
	providerId: string;
	accessToken: string | null;
	refreshToken: string | null;
	accessTokenExpiresAt: number | null;
	refreshTokenExpiresAt: number | null;
	scope: string | null;
	idToken: string | null;
	password: string | null;
	createdAt: number;
	updatedAt: number;
};

export type auth_space = {
	id: string;
	name: string;
	ownerId: string;
	createdAt: number;
	updatedAt: number;
};

export type SpaceRole = "guest" | "member" | "admin";

export type auth_space_member = {
	id: string;
	spaceId: string;
	userId: string;
	role: SpaceRole;
	createdAt: number;
};

export type auth_space_invite = {
	id: string;
	spaceId: string;
	email: string | null;
	role: SpaceRole;
	invitedByUserId: string;
	createdAt: number;
	acceptedAt: number | null;
	tokenHash: string | null;
	expiresAt: number;
};

export type auth_password_reset = {
	id: string;
	userId: string;
	tokenHash: string;
	createdByUserId: string | null;
	createdAt: number;
	expiresAt: number;
	usedAt: number | null;
};

export type auth_email_verification = {
	id: string;
	userId: string;
	email: string;
	tokenHash: string;
	createdAt: number;
	expiresAt: number;
	usedAt: number | null;
};

export type auth_user_avatar = {
	userId: string;
	contentType: string;
	data: Uint8Array;
	updatedAt: number;
};

export type api_token = {
	id: string;
	userId: string;
	name: string;
	secretHash: string;
	createdAt: number;
	/** null until the token is first used. */
	lastUsedAt: number | null;
	/** null for a token that never expires. */
	expiresAt: number | null;
};
