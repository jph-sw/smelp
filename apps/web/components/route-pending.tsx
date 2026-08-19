import { Spinner } from "./ui/spinner";

export function RoutePending() {
	return (
		<div className="flex h-full w-full items-center justify-center">
			<Spinner className="size-6" />
		</div>
	);
}
