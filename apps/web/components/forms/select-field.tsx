import { useFieldContext } from "#/hooks/form-context";
import { Field, FieldError, FieldLabel } from "../ui/field";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select";

export default function SelectField({
	label,
	items,
	className,
}: {
	label: string;
	items: { label: string; value: string }[];
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
			{isInvalid && <FieldError errors={field.state.meta.errors} />}
		</Field>
	);
}
