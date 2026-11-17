import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Switch } from "#/components/ui/switch";
import { type AuthUser, currentUserQueryOptions } from "#/lib/auth";
import { instanceStatusQueryOptions } from "#/lib/data/instance";
import { toastError } from "#/lib/errors";
import { orpc } from "#/lib/orpc";
import { SettingsSection } from "./settings-section";

export function NotificationsCard({ user }: { user: AuthUser }) {
	const queryClient = useQueryClient();
	const { data: status } = useQuery(instanceStatusQueryOptions);
	const [isSaving, setIsSaving] = useState(false);
	const labelId = useId();

	const change = async (emailNotifications: boolean) => {
		setIsSaving(true);
		try {
			await orpc.auth.updateNotificationPreferences({ emailNotifications });
			await queryClient.invalidateQueries({
				queryKey: currentUserQueryOptions.queryKey,
			});
		} catch (e) {
			toastError(e);
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<SettingsSection title="Notifications" className="space-y-2">
			<div className="flex items-center justify-between gap-4">
				<span id={labelId} className="text-sm">
					Email me about new notifications
				</span>
				<Switch
					aria-labelledby={labelId}
					checked={user.notifyByEmail === 1}
					disabled={isSaving}
					onCheckedChange={change}
				/>
			</div>
			<p className="text-xs text-muted-foreground">
				{status && !status.emailEnabled
					? "This install can't send email yet, so you'll only see notifications in your inbox."
					: "Assignments, comments on your work and mentions also arrive by email. The inbox always has them."}
			</p>
		</SettingsSection>
	);
}
