import { useDragDropMonitor, useDroppable } from "@dnd-kit/react";
import type { tables } from "@smelp/db";
import { Children, useState } from "react";
import { cn } from "#/lib/utils";

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
		<div className="group relative flex h-full min-h-0 w-72 shrink-0 flex-col sm:w-87.5">
			<div className="sticky top-0 z-2 w-full shrink-0 py-1">
				<div className="relative flex w-full shrink-0 items-center gap-1 py-1.5">
					<div className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-xs">
						<div
							className="size-3 rounded-full ring-1 ring-foreground/20"
							style={{ backgroundColor: state.color }}
						/>
					</div>
					<div className="relative flex w-full items-baseline overflow-hidden">
						<div className="truncate overflow-hidden font-medium">
							{state.name}
						</div>
						<div className="shrink-0 ps-2 font-medium text-muted-foreground tabular-nums">
							{Children.count(props.children)}
						</div>
					</div>
				</div>
			</div>
			<div
				className={cn(
					"min-h-30 flex-1 overflow-y-auto rounded-lg transition-colors duration-150",
					isHovered && "bg-foreground/5",
				)}
				ref={ref}
				id={state.id}
			>
				<div className="relative space-y-2">{props.children}</div>
			</div>
		</div>
	);
}
