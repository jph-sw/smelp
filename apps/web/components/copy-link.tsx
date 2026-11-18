import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { toast } from "./ui/toast";

export async function copyToClipboard(text: string, copiedMessage: string) {
	try {
		await navigator.clipboard.writeText(text);
		toast({ type: "success", description: copiedMessage });
	} catch {
		toast({
			type: "error",
			description: "Couldn't copy it. Select it and copy it yourself.",
		});
	}
}

export function CopyLink({
	title,
	hint,
	link,
	copiedMessage = "Link copied.",
}: {
	title: string;
	hint: string;
	link: string;
	copiedMessage?: string;
}) {
	return (
		<div className="flex flex-col gap-2 rounded-lg bg-secondary p-3">
			<p className="text-sm font-medium [overflow-wrap:anywhere]">{title}</p>
			<div className="flex gap-2">
				<Input
					readOnly
					aria-label={title}
					value={link}
					onFocus={(event) => event.target.select()}
				/>
				<Button onClick={() => copyToClipboard(link, copiedMessage)}>
					Copy
				</Button>
			</div>
			<p className="text-xs text-muted-foreground">{hint}</p>
		</div>
	);
}
