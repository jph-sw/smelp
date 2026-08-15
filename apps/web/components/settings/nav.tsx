export function SettingsNav({ children }: { children: React.ReactNode }) {
	return (
		<nav className="flex w-56 shrink-0 flex-col gap-4 border-r py-4">
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
			<div className="px-3 py-1 text-[11px] text-muted-foreground/70 font-semibold">
				{label}
			</div>
			{children}
		</div>
	);
}

export const settingsNavLinkClassName =
	"flex h-8 items-center gap-2 px-3 text-xs text-muted-foreground hover:text-foreground data-[status=active]:font-medium data-[status=active]:text-foreground";
