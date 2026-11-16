import { useFieldContext } from "#/hooks/form-context";
import { Field, FieldError, FieldLabel } from "../ui/field";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectItemIcon,
	SelectTrigger,
	SelectValueWithIcon,
} from "../ui/select";

export default function SelectField({
	label,
	items,
	className,
}: {
	label: string;
	items: { label: string; value: string; icon?: React.ReactNode }[];
	className?: React.ComponentProps<"select">["className"];
}) {
	const field = useFieldContext();
	const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

	return (
		<Field className={className} invalid={isInvalid}>
			<FieldLabel>{label}</FieldLabel>
			<Select
				items={items}
				value={field.state.value}
				onValueChange={field.handleChange}
			>
				<SelectTrigger className="w-full">
					<SelectValueWithIcon
						icon={items.find((item) => item.value === field.state.value)?.icon}
					/>
				</SelectTrigger>
				<SelectContent>
					{items.map((item) => (
						<SelectItem key={item.value} value={item.value}>
							{item.icon && <SelectItemIcon>{item.icon}</SelectItemIcon>}
							{item.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			{isInvalid && <FieldError errors={field.state.meta.errors} />}
		</Field>
	);
}
