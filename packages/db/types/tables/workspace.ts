export type workspace = {
	id: string;
	name: string;
	ownerId: string;
	spaceId: string;
	image: string | null;
	/** 1 when its admins let anyone read its public projects; needs the instance's public access too. */
	public: number;
};
