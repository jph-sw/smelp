import { Input } from "#/components/ui/input";
import { useFieldContext } from "#/hooks/form-context";
import { Field, FieldError, FieldLabel } from "../ui/field";

export default function TextField({
	label,
	type,
	autoComplete,
	readOnly = false,
	disabled = false,
	className,
}: {
	label: string;
	type?: string;
	autoComplete?: React.ComponentProps<"input">["autoComplete"];
	readOnly?: boolean;
	disabled?: boolean;
	className?: React.ComponentProps<"input">["className"];
}) {
	const field = useFieldContext<string>();
	const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

	return (
		<Field className={className} invalid={isInvalid}>
			<FieldLabel>{label}</FieldLabel>
			<Input
				name={field.name}
				value={field.state.value}
				type={type}
				autoComplete={autoComplete}
				onChange={(e) => field.handleChange(e.target.value)}
				onBlur={field.handleBlur}
				readOnly={readOnly}
				disabled={disabled}
			/>
			{isInvalid && <FieldError errors={field.state.meta.errors} />}
		</Field>
	);
}
