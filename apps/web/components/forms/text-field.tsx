import { Input } from "#/components/ui/input";
import { useFieldContext } from "#/hooks/form-context";
import { Field, FieldError, FieldLabel } from "../ui/field";

export default function TextField({
	label,
	type,
	readOnly = false,
	disabled = false,
	className,
}: {
	label: string;
	type?: string;
	readOnly?: boolean;
	disabled?: boolean;
	className?: React.ComponentProps<"input">["className"];
}) {
	const id = `${label}-${crypto.randomUUID()}`;
	const field = useFieldContext<string>();
	const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

	return (
		<Field className={className}>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<Input
				id={id}
				name={field.name}
				value={field.state.value}
				type={type}
				onChange={(e) => field.handleChange(e.target.value)}
				onBlur={field.handleBlur}
				readOnly={readOnly}
				disabled={disabled}
				aria-invalid={isInvalid}
			/>
			{isInvalid && <FieldError errors={field.state.meta.errors} />}
		</Field>
	);
}
