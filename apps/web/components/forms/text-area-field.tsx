import { useFieldContext } from "#/hooks/form-context";
import { Field, FieldError, FieldLabel } from "../ui/field";
import { Textarea } from "../ui/textarea";

export default function TextAreaField({
	label,
	readOnly = false,
	disabled = false,
	className,
}: {
	label: string;
	readOnly?: boolean;
	disabled?: boolean;
	className?: React.ComponentProps<"textarea">["className"];
}) {
	const field = useFieldContext<string>();
	const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

	return (
		<Field className={className} invalid={isInvalid}>
			<FieldLabel>{label}</FieldLabel>
			<Textarea
				name={field.name}
				value={field.state.value}
				onChange={(e) => field.handleChange(e.target.value)}
				onBlur={field.handleBlur}
				readOnly={readOnly}
				disabled={disabled}
			/>
			{isInvalid && <FieldError errors={field.state.meta.errors} />}
		</Field>
	);
}
