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
	email: string;
	role: SpaceRole;
	invitedByUserId: string;
	createdAt: number;
	acceptedAt: number | null;
};
