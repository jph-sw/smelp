export type auth_session = {
	id: string;
	userId: string;
	secretHash: Uint8Array;
	tokenLastVerifiedAt: number;
	createdAt: number;
};

export type auth_user = {
	id: string;
	name: string;
	email: string;
	role?: string;
	image?: string;
	createdAt: number;
	updatedAt: number;
};

export type auth_account = {
	id: string;
	userId: string;
	accountId: string;
	providerId: string;
	accessToken?: string;
	refreshToken?: string;
	accessTokenExpiresAt?: number;
	refreshTokenExpiresAt?: number;
	scope?: string;
	idToken?: string;
	password?: string;
	createdAt: number;
	updatedAt: number;
};

export type auth_permission = {
	id: string;
	spaceId: string;
	userId: string;
	permission?: string;
	effect: "grant" | "deny";
};

export type auth_space = {
	id: string;
	name: string;
	ownerId: string;
	createdAt: number;
	updatedAt: number;
};

export type SpaceRole = "viewer" | "participant" | "admin" | "owner";

export type auth_space_member = {
	id: string;
	spaceId: string;
	userId: string;
	role: SpaceRole;
	createdAt: number;
};
