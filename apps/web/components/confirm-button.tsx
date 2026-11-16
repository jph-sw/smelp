import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "./ui/alert-dialog";
import { Button } from "./ui/button";

export function ConfirmButton({
	label,
	title,
	description,
	confirmLabel,
	buttonLabel,
	disabled,
	onConfirm,
}: {
	label?: string;
	title: string;
	description: string;
	confirmLabel: string;
	buttonLabel: string;
	disabled?: boolean;
	onConfirm: () => void;
}) {
	return (
		<AlertDialog>
			<AlertDialogTrigger
				aria-label={label}
				render={<Button variant="ghost" size="sm" className="shrink-0" />}
			>
				{buttonLabel}
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle className="[overflow-wrap:anywhere]">
						{title}
					</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogCancel
						variant="destructive"
						disabled={disabled}
						onClick={onConfirm}
					>
						{confirmLabel}
					</AlertDialogCancel>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
