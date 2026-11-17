import { useId } from "react";
import { Card, CardContent } from "#/components/ui/card";

export function SettingsSection({
	title,
	description,
	className,
	children,
}: {
	title: string;
	description?: React.ReactNode;
	className?: string;
	children: React.ReactNode;
}) {
	const headingId = useId();
	return (
		<section
			aria-labelledby={headingId}
			className="grid gap-4 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:gap-10"
		>
			<div className="space-y-1">
				<h2 id={headingId} className="text-sm font-semibold">
					{title}
				</h2>
				{description && (
					<p className="text-sm text-muted-foreground">{description}</p>
				)}
			</div>
			<Card>
				<CardContent className={className}>{children}</CardContent>
			</Card>
		</section>
	);
}
