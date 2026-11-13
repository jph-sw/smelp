import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { toast } from "./ui/toast";

// Shows a one-time link that can't be retrieved later.
export function CopyLink({
	title,
	hint,
	link,
}: {
	title: string;
	hint: string;
	link: string;
}) {
	const copy = async () => {
		try {
			await navigator.clipboard.writeText(link);
			toast({ type: "success", description: "Link copied." });
		} catch {
			toast({
				type: "error",
				description: "Couldn't copy the link. Select it and copy it yourself.",
			});
		}
	};

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
				<Button onClick={copy}>Copy</Button>
			</div>
			<p className="text-xs text-muted-foreground">{hint}</p>
		</div>
	);
}
