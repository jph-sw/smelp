import { createFormHook } from "@tanstack/react-form";
import SelectField from "#/components/forms/select-field";
import TextAreaField from "#/components/forms/text-area-field";
import { cn } from "#/lib/utils";
import TextField from "../components/forms/text-field";
import { Button } from "../components/ui/button";
import { fieldContext, formContext, useFormContext } from "./form-context";

function SubscribeButton({
	label,
	className,
}: {
	label: string;
	className?: string;
}) {
	const form = useFormContext();
	return (
		<form.Subscribe selector={(state) => state.isSubmitting}>
			{(isSubmitting) => (
				<Button
					type="submit"
					className={cn("mt-4", className)}
					disabled={isSubmitting}
				>
					{label}
				</Button>
			)}
		</form.Subscribe>
	);
}

export const { useAppForm } = createFormHook({
	fieldComponents: {
		TextField,
		TextAreaField,
		SelectField,
	},
	formComponents: {
		SubscribeButton,
	},
	fieldContext,
	formContext,
});
