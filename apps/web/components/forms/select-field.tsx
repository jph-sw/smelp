import { useId } from "react";
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
	const id = useId();
	const field = useFieldContext();
	const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

	return (
		<Field className={className}>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<Select
				items={items}
				value={field.state.value}
				onValueChange={field.handleChange}
			>
				<SelectTrigger id={id} aria-invalid={isInvalid}>
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
