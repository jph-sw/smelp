import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select";

export function ViewSelect<T extends string>({
	label,
	value,
	options,
	isOption,
	onChange,
}: {
	label: string;
	value: T;
	options: Record<T, string>;
	isOption: (value: unknown) => value is T;
	onChange: (value: T) => void;
}) {
	const items = Object.entries<string>(options).map(([value, label]) => ({
		value,
		label,
	}));
	return (
		<Select
			items={items}
			value={value}
			onValueChange={(next) => {
				if (isOption(next)) onChange(next);
			}}
		>
			<SelectTrigger aria-label={label} className="w-auto">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{items.map((item) => (
					<SelectItem key={item.value} value={item.value}>
						{item.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
