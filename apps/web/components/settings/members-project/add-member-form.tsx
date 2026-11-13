import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
	addProjectMember,
	availableProjectMembersQueryOptions,
} from "#/lib/data/project-members";
import { toastError } from "#/lib/errors";
import { Button } from "../../ui/button";
import { FieldGroup, FieldLabel } from "../../ui/field";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../../ui/select";
import { toast } from "../../ui/toast";

export function AddMemberForm({
	projectId,
	onSuccess,
}: {
	projectId: string;
	onSuccess: () => void;
}) {
	const queryClient = useQueryClient();

	const { data: candidates } = useQuery(
		availableProjectMembersQueryOptions({ projectId }),
	);

	const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
	const [role, setRole] = useState<"guest" | "member" | "admin">("member");
	const [isSubmitting, setIsSubmitting] = useState(false);

	const selectedUser = candidates?.find((c) => c.userId === selectedUserId);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!selectedUserId) return;

		setIsSubmitting(true);
		try {
			await addProjectMember({ projectId, userId: selectedUserId, role });
			await queryClient.invalidateQueries({
				queryKey: ["project-members", projectId],
			});
			toast({
				type: "success",
				description: `Added ${selectedUser?.displayName ?? "member"} to the project.`,
			});
			onSuccess();
		} catch (e) {
			toastError(e);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<form onSubmit={handleSubmit}>
			<FieldGroup className="flex flex-col gap-2">
				<div className="flex flex-col gap-1">
					<FieldLabel>Member</FieldLabel>
					<Select
						value={selectedUserId ?? undefined}
						onValueChange={(value) => setSelectedUserId(value)}
					>
						<SelectTrigger className="w-full">
							<SelectValue placeholder="Select a workspace member" />
						</SelectTrigger>
						<SelectContent>
							{candidates?.length ? (
								candidates.map((candidate) => (
									<SelectItem key={candidate.userId} value={candidate.userId}>
										{candidate.fullName} ({candidate.email})
									</SelectItem>
								))
							) : (
								<div className="px-2 py-1.5 text-xs text-muted-foreground">
									No workspace members available to add
								</div>
							)}
						</SelectContent>
					</Select>
				</div>
				<div className="flex flex-col gap-1">
					<FieldLabel>Role</FieldLabel>
					<Select
						value={role}
						onValueChange={(value) =>
							setRole(value as "guest" | "member" | "admin")
						}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="guest">Guest</SelectItem>
							<SelectItem value="member">Member</SelectItem>
							<SelectItem value="admin">Admin</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</FieldGroup>
			<Button
				type="submit"
				className="mt-4"
				disabled={!selectedUserId || isSubmitting}
			>
				Add member
			</Button>
		</form>
	);
}
