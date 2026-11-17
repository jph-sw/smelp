import { ViewIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Toggle, ToggleIcon } from "@ui-sdk/react/toggle";
import { setWatching, watchersQueryOptions } from "#/lib/data/issue";
import { toastError } from "#/lib/errors";

export function WatchToggle({ issueId }: { issueId: string }) {
	const queryClient = useQueryClient();
	const options = watchersQueryOptions({ issueId });
	const { data } = useQuery(options);

	const { mutate, isPending } = useMutation({
		mutationFn: (watching: boolean) => setWatching({ issueId, watching }),
		onSuccess: (result) => queryClient.setQueryData(options.queryKey, result),
		onError: (e) => toastError(e, "Couldn't change whether you watch this."),
	});

	if (!data?.canWatch) return null;

	const names = data.watchers.map((watcher) => watcher.name).join(", ");
	return (
		<Toggle
			pressed={data.watching}
			onPressedChange={(watching) => mutate(watching)}
			disabled={isPending}
			title={names ? `Watching: ${names}` : "Nobody watches this yet"}
			className="ml-auto flex h-7 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-xs text-muted-foreground hover:border-foreground/30 data-pressed:border-primary data-pressed:bg-primary/10 data-pressed:text-foreground"
		>
			<ToggleIcon>
				<HugeiconsIcon icon={ViewIcon} className="size-3.5" />
			</ToggleIcon>
			Watch
			<span className="tabular-nums">{data.count}</span>
		</Toggle>
	);
}
