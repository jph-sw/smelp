import type { FieldElementProps } from "@formisch/react";
import { useEffect, useState } from "react";
import { Field, FieldError, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";

interface TextInputProps extends FieldElementProps {
	className?: string;
	type: "text" | "email" | "tel" | "password" | "url" | "number" | "date";
	label?: string;
	placeholder?: string;
	required?: boolean;
	input: string | number | undefined;
	errors: [string, ...string[]] | null;
}

export function TextInput({
	label,
	input,
	errors,
	className,
	...props
}: TextInputProps) {
	const { name, type } = props;

	const [value, setValue] = useState<string | number | undefined>(input);
	useEffect(() => {
		if (!Number.isNaN(input)) {
			setValue(input);
		}
	}, [input]);
	return (
		<Field data-invalid={errors !== null}>
			<FieldLabel htmlFor={name}>{label}</FieldLabel>
			<Input
				{...props}
				id={name}
				value={value ?? ""}
				aria-invalid={!!errors}
				aria-errormessage={`${name}-error`}
				type={type}
			/>
			{errors && <FieldError errors={errors.map((message) => ({ message }))} />}
		</Field>
	);
}
