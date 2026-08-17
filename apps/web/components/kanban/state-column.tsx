import { useDragDropMonitor, useDroppable } from "@dnd-kit/react";
import { FullScreenIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { tables } from "@smelp/db";
import { useState } from "react";
import { cn } from "#/lib/utils";
import { Button } from "../ui/button";

export function StateColumn({
	state,
	...props
}: React.ComponentProps<"div"> & { state: tables["state"] }) {
	const [isHovered, setIsHovered] = useState(false);

	const { ref } = useDroppable({
		id: state.id,
	});

	useDragDropMonitor({
		onDragOver(event) {
			if (state.id === event.operation.target?.id) {
				setIsHovered(true);
			} else {
				setIsHovered(false);
			}
		},
		onDragEnd() {
			setIsHovered(false);
		},
	});

	return (
		<div
			key={state.id}
			className={"h-full w-[350px] group relative flex shrink-0 flex-col"}
		>
			<div className="sticky top-0 z-2 w-full shrink-0 py-1">
				<div className="relative flex shrink-0 gap-1 py-1.5 w-full items-center">
					<div className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-xs">
						<div className="size-4 rounded-full bg-muted" />
					</div>
					<div className="relative flex w-full items-baseline overflow-hidden">
						<div className="truncate overflow-hidden font-medium">
							{state.name}
						</div>
						<div className="shrink-0 font-medium ps-2">1</div>
					</div>
					<Button variant={"ghost"} size={"icon-sm"}>
						<HugeiconsIcon icon={FullScreenIcon} />
					</Button>
					<Button variant={"ghost"} size={"icon-sm"}>
						<HugeiconsIcon icon={FullScreenIcon} />
					</Button>
				</div>
			</div>
			<div
				className={cn(
					"h-full min-h-[120px]",
					isHovered ? "border rounded-lg overflow-hidden" : "",
				)}
				ref={ref}
				id={state.id}
			>
				<div className="relative h-full">{props.children}</div>
			</div>
		</div>
	);
}
