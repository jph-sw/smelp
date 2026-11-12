/** The only emoji a comment can be reacted to with. Keep in sync with apps/web/lib/reactions.ts. */
export const REACTION_EMOJIS = ["👍", "❤️", "😄", "🎉", "😕", "👀"] as const;

export type comment_reaction = {
	commentId: string;
	userId: string;
	emoji: string;
	createdAt: number;
};
