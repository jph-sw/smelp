import { SmileIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { REACTION_EMOJIS, type ReactionEmoji } from "#/lib/reactions";
import { cn } from "#/lib/utils";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

export type CommentReaction = {
	emoji: string;
	count: number;
	reacted: boolean;
	users: string[];
};

export function ReactionPills({
	reactions,
	canReact,
	onToggle,
}: {
	reactions: CommentReaction[];
	canReact: boolean;
	onToggle: (emoji: ReactionEmoji, reacted: boolean) => void;
}) {
	if (reactions.length === 0) return null;
	return (
		<div className="mt-2 flex flex-wrap items-center gap-1">
			{reactions.map((reaction) => (
				<button
					key={reaction.emoji}
					type="button"
					// aria-disabled rather than disabled, so the "who reacted" title still shows.
					aria-disabled={!canReact}
					aria-pressed={reaction.reacted}
					aria-label={`${reaction.emoji} ${reaction.count}: ${reaction.users.join(", ")}`}
					title={reaction.users.join(", ")}
					onClick={
						canReact
							? () =>
									onToggle(reaction.emoji as ReactionEmoji, !reaction.reacted)
							: undefined
					}
					className={cn(
						"flex h-6 items-center gap-1 rounded-full border px-2 text-xs",
						reaction.reacted
							? "border-primary bg-primary/10 text-foreground"
							: "bg-background text-muted-foreground",
						canReact && "cursor-pointer hover:border-foreground/30",
					)}
				>
					<span>{reaction.emoji}</span>
					<span className="tabular-nums">{reaction.count}</span>
				</button>
			))}
		</div>
	);
}

export function ReactionPicker({
	reactions,
	onToggle,
}: {
	reactions: CommentReaction[];
	onToggle: (emoji: ReactionEmoji, reacted: boolean) => void;
}) {
	const [open, setOpen] = useState(false);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				aria-label="Add reaction"
				render={<Button variant="ghost" size="icon-sm" />}
			>
				<HugeiconsIcon icon={SmileIcon} />
			</PopoverTrigger>
			<PopoverContent align="end" className="w-auto flex-row gap-1 p-1.5">
				{REACTION_EMOJIS.map((emoji) => (
					<button
						key={emoji}
						type="button"
						aria-label={`React with ${emoji}`}
						className="cursor-pointer rounded-md p-1 text-base hover:bg-secondary"
						onClick={() => {
							setOpen(false);
							const existing = reactions.find((r) => r.emoji === emoji);
							onToggle(emoji, !existing?.reacted);
						}}
					>
						{emoji}
					</button>
				))}
			</PopoverContent>
		</Popover>
	);
}
