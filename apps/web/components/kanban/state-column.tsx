import { useDragDropMonitor, useDroppable } from "@dnd-kit/react";
import {
	ArrowLeftDoubleIcon,
	ArrowRightDoubleIcon,
	PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { tables } from "@smelp/db";
import { Children, useState } from "react";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";

export function StateColumn({
	state,
	collapsed = false,
	onToggleCollapsed,
	onCreate,
	...props
}: React.ComponentProps<"div"> & {
	state: tables["state"];
	collapsed?: boolean;
	onToggleCollapsed?: () => void;
	onCreate?: () => void;
}) {
	const [isHovered, setIsHovered] = useState(false);

	const { ref } = useDroppable({
		id: state.id,
		type: "column",
		accept: "issue",
		// Low, so a card under the pointer wins over the column around it.
		collisionPriority: 1,
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

	const dot = (
		<div className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-xs">
			<div
				className="size-3 rounded-full ring-1 ring-foreground/20"
				style={{ backgroundColor: state.color }}
			/>
		</div>
	);
	const count = Children.count(props.children);

	return (
		<div
			className={cn(
				"group relative flex h-full min-h-0 shrink-0 flex-col pointer-coarse:snap-start",
				collapsed
					? "w-10 items-center gap-2 overflow-hidden rounded-lg py-1 text-sm transition-colors duration-150"
					: "w-[min(18rem,calc(100vw-3.5rem))] sm:w-87.5",
				collapsed && isHovered && "bg-foreground/5",
			)}
			ref={collapsed ? ref : undefined}
			id={collapsed ? state.id : undefined}
		>
			{!collapsed && onCreate && (
				<Button
					variant="ghost"
					size="icon-sm"
					className={cn(
						"absolute top-1.5 z-3 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100",
						onToggleCollapsed ? "end-8" : "end-0",
					)}
					// Not "New work item": name matching would also hit the sidebar button.
					aria-label={`Add work item to ${state.name}`}
					onClick={onCreate}
				>
					<HugeiconsIcon icon={PlusSignIcon} />
				</Button>
			)}
			{/* One button in both layouts, so keyboard focus survives the toggle. */}
			{onToggleCollapsed && (
				<Button
					variant="ghost"
					size="icon-sm"
					className={cn(
						"shrink-0",
						!collapsed &&
							"absolute end-0 top-1.5 z-3 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100",
					)}
					aria-expanded={!collapsed}
					aria-label={`${collapsed ? "Expand" : "Collapse"} ${state.name}`}
					onClick={onToggleCollapsed}
				>
					<HugeiconsIcon
						icon={collapsed ? ArrowRightDoubleIcon : ArrowLeftDoubleIcon}
					/>
				</Button>
			)}
			{collapsed ? (
				<>
					{dot}
					<div
						className="min-h-0 truncate font-medium [writing-mode:vertical-rl]"
						title={state.name}
					>
						{state.name}
					</div>
					<div className="shrink-0 font-medium text-muted-foreground tabular-nums">
						{count}
					</div>
				</>
			) : (
				<>
					<div className="sticky top-0 z-2 w-full shrink-0 py-1">
						<div
							className={cn(
								"relative flex w-full shrink-0 items-center gap-1 py-1.5 text-sm",
								onCreate && onToggleCollapsed
									? "pe-16"
									: (onCreate || onToggleCollapsed) && "pe-8",
							)}
						>
							{dot}
							<div className="relative flex w-full items-baseline overflow-hidden">
								<div className="truncate overflow-hidden font-medium">
									{state.name}
								</div>
								<div className="shrink-0 ps-2 font-medium text-muted-foreground tabular-nums">
									{count}
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
				</>
			)}
		</div>
	);
}
