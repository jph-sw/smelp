export function SettingsNav({
	children,
	title,
}: {
	children: React.ReactNode;
	title: string;
}) {
	return (
		<nav className="flex shrink-0 flex-col gap-2 border-b py-3 md:w-56 md:gap-4 md:border-r md:border-b-0 md:py-4">
			<h2 className="px-3 text-sm font-medium">{title}</h2>
			{children}
		</nav>
	);
}

export function SettingsNavGroup({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-0.5">
			<div className="hidden px-3 py-1 text-[11px] font-semibold text-muted-foreground md:block">
				{label}
			</div>
			<div className="flex gap-0.5 overflow-x-auto px-2 md:flex-col">
				{children}
			</div>
		</div>
	);
}

export const settingsNavLinkClassName =
	"flex h-8 shrink-0 items-center gap-2 rounded-md px-2 text-xs text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground data-[status=active]:bg-muted data-[status=active]:font-medium data-[status=active]:text-foreground";
