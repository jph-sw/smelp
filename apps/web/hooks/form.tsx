import { createFormHook } from "@tanstack/react-form";
import TextField from "../components/forms/text-field";
import { Button } from "../components/ui/button";
import { fieldContext, formContext, useFormContext } from "./form-context";

function SubscribeButton({ label }: { label: string }) {
	const form = useFormContext();
	return (
		<form.Subscribe selector={(state) => state.isSubmitting}>
			{(isSubmitting) => (
				<Button type="submit" className={"mt-2"} disabled={isSubmitting}>
					{label}
				</Button>
			)}
		</form.Subscribe>
	);
}

export const { useAppForm } = createFormHook({
	fieldComponents: {
		TextField,
	},
	formComponents: {
		SubscribeButton,
	},
	fieldContext,
	formContext,
});
