import {
	Toast,
	ToastAction,
	ToastClose,
	ToastDescription,
	ToastRegion,
	ToastTitle,
	toast,
} from "@ui-sdk/react/toast";

function Toaster() {
	return (
		<ToastRegion
			side="bottom"
			align="end"
			className="mb-[env(safe-area-inset-bottom)]"
		>
			{() => (
				<Toast>
					<ToastTitle />
					<ToastDescription />
					<ToastAction />
					<ToastClose aria-label="Dismiss" />
				</Toast>
			)}
		</ToastRegion>
	);
}

export { Toaster, toast };
