import type { DEFAULTS } from "@smelp/db";

// Mirrors DEFAULTS.REACTION_EMOJIS in @smelp/db, which the API enforces.
export const REACTION_EMOJIS = [
	"👍",
	"❤️",
	"😄",
	"🎉",
	"😕",
	"👀",
] as const satisfies typeof DEFAULTS.REACTION_EMOJIS;

export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];
