// inspiration took from https://github.com/R4ULtv/ui/blob/master/registry/icon-picker/icon-picker-tanstack.tsx
import * as HugeIconsCollection from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import * as React from "react";
import { Input } from "#/components/ui/input";
import { useDebounce } from "#/hooks/use-debounce";
import { cn } from "#/lib/utils";

const allIcons: Record<string, unknown> = HugeIconsCollection;

const IconItem = React.memo(
	({
		iconName,
		setSelectedIcon,
		selectedIcon,
	}: {
		iconName: string;
		setSelectedIcon?: (iconName: string) => void;
		selectedIcon?: string | null;
	}) => {
		const icon = allIcons[iconName];
		const handleClick = React.useCallback(() => {
			setSelectedIcon?.(iconName);
		}, [iconName, setSelectedIcon]);
		return (
			<button
				className={cn(
					"flex items-center justify-center size-7 rounded-md cursor-pointer text-popover-foreground/70 hover:bg-muted hover:text-popover-foreground transition-colors",
					selectedIcon === iconName &&
						"bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
				)}
				onClick={handleClick}
				title={iconName}
				type="button"
				aria-label={`Select ${iconName} icon`}
				aria-pressed={selectedIcon === iconName}
			>
				<HugeiconsIcon icon={icon as never} size={24} />
			</button>
		);
	},
);
IconItem.displayName = "IconItem";

const IconPicker = React.memo(
	({
		setSelectedIcon,
		selectedIcon,
		className,
		...props
	}: {
		setSelectedIcon?: (iconName: string) => void;
		selectedIcon?: string | null;
	} & React.ComponentProps<"div">) => {
		const [searchQuery, setSearchQuery] = React.useState("");
		const debouncedSearchQuery = useDebounce(searchQuery, 200);

		const iconsMap = React.useMemo(
			() =>
				Object.keys(allIcons).filter(
					(key) => key.endsWith("Icon") && Array.isArray(allIcons[key]),
				),
			[],
		);

		const filteredIcons = React.useMemo(() => {
			if (!debouncedSearchQuery.trim()) return iconsMap;
			return iconsMap.filter((iconName) =>
				iconName.toLowerCase().includes(debouncedSearchQuery.toLowerCase()),
			);
		}, [iconsMap, debouncedSearchQuery]);

		const handleSearchChange = React.useCallback(
			(e: React.ChangeEvent<HTMLInputElement>) => {
				setSearchQuery(e.target.value);
			},
			[],
		);

		const parentRef = React.useRef<HTMLDivElement>(null);
		const ITEMS_PER_ROW = 9;
		const totalRows = Math.ceil(filteredIcons.length / ITEMS_PER_ROW);

		const rowVirtualizerForGrid = useVirtualizer({
			count: totalRows,
			getScrollElement: () => parentRef.current,
			estimateSize: () => 28,
			overscan: 10,
		});

		return (
			<div
				className={cn(
					"max-w-72 bg-popover rounded-lg border shadow-md",
					className,
				)}
				{...props}
			>
				<div className="relative mt-1.5 mx-1.5">
					<Input
						autoComplete="off"
						autoCorrect="off"
						autoCapitalize="off"
						spellCheck={false}
						className="border-none focus-visible:ring-2 font-semibold px-2.5 py-2 min-w-0 md:min-w-[252px]"
						placeholder="Search..."
						type="text"
						value={searchQuery}
						onChange={handleSearchChange}
						aria-label="Search icons"
					/>
				</div>
				<div className="h-80 p-1.5">
					<div ref={parentRef} className="overflow-auto h-full w-full">
						<div
							className="relative w-full"
							style={{ height: `${rowVirtualizerForGrid.getTotalSize()}px` }}
						>
							{rowVirtualizerForGrid
								.getVirtualItems()
								.map(
									(virtualRow: {
										index: number;
										size: number;
										start: number;
									}) => {
										const rowStartIndex = virtualRow.index * ITEMS_PER_ROW;
										const rowIcons = filteredIcons.slice(
											rowStartIndex,
											rowStartIndex + ITEMS_PER_ROW,
										);

										return (
											<div
												key={virtualRow.index}
												className="grid grid-cols-9 absolute top-0 left-0 w-full"
												style={{
													height: `${virtualRow.size}px`,
													transform: `translateY(${virtualRow.start}px)`,
												}}
											>
												{rowIcons.map((iconName) => (
													<IconItem
														key={iconName}
														iconName={iconName}
														setSelectedIcon={setSelectedIcon}
														selectedIcon={selectedIcon}
													/>
												))}
											</div>
										);
									},
								)}
						</div>
					</div>
				</div>
			</div>
		);
	},
);
IconPicker.displayName = "IconPicker";
export default IconPicker;
