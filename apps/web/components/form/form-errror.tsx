import { Alert, AlertTitle } from "#/components/ui/alert";
import { Field } from "#/components/ui/field";

export function FormError({
	errors,
}: {
	errors: [string, ...string[]] | null;
}) {
	if (errors == null) return "";

	return (
		<Field>
			<Alert variant={"destructive"}>
				<AlertTitle>{errors[0]}</AlertTitle>
			</Alert>
		</Field>
	);
}
