import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import * as v from "valibot";
import { ConfirmButton } from "#/components/confirm-button";
import { CopyLink } from "#/components/copy-link";
import { FieldGroup } from "#/components/ui/field";
import { toast } from "#/components/ui/toast";
import { useAppForm } from "#/hooks/form";
import {
	apiTokensQueryOptions,
	createApiToken,
	revokeApiToken,
} from "#/lib/data/api-tokens";
import { toastError } from "#/lib/errors";
import { formatDate, formatRelativeTime } from "#/lib/utils";
import { SettingsSection } from "./settings-section";

const EXPIRY_DAYS = { "30": 30, "90": 90, "365": 365, never: null } as const;

const EXPIRY_ITEMS = [
	{ label: "30 days", value: "30" },
	{ label: "90 days", value: "90" },
	{ label: "1 year", value: "365" },
	{ label: "No expiry", value: "never" },
];

const ApiTokenSchema = v.object({
	name: v.pipe(
		v.string(),
		v.trim(),
		v.minLength(1, "Name the token, like the script or agent that uses it."),
		v.maxLength(100, "Use at most 100 characters."),
	),
	expiry: v.picklist(["30", "90", "365", "never"]),
});

export function ApiTokensCard() {
	const queryClient = useQueryClient();
	const { data: tokens } = useQuery(apiTokensQueryOptions);
	const [newToken, setNewToken] = useState<{
		id: string;
		name: string;
		token: string;
	} | null>(null);

	const refresh = () =>
		queryClient.invalidateQueries({
			queryKey: apiTokensQueryOptions.queryKey,
		});

	const form = useAppForm({
		defaultValues: { name: "", expiry: "90" },
		validators: { onSubmit: ApiTokenSchema },
		onSubmit: async ({ value, formApi }) => {
			try {
				const { name, expiry } = v.parse(ApiTokenSchema, value);
				const created = await createApiToken({
					name,
					expiresInDays: EXPIRY_DAYS[expiry],
				});
				setNewToken({
					id: created.id,
					name: created.name,
					token: created.token,
				});
				formApi.reset();
				await refresh();
			} catch (e) {
				toastError(e);
			}
		},
	});

	const { mutate: revoke, isPending: isRevoking } = useMutation({
		mutationFn: revokeApiToken,
		onSuccess: (_, { id }) => {
			setNewToken((shown) => (shown?.id === id ? null : shown));
			toast({ type: "success", description: "Token revoked." });
		},
		onError: (e) => toastError(e),
		onSettled: refresh,
	});

	return (
		<SettingsSection
			title="API tokens"
			description={
				<>
					Scripts and agents can use a token to act as you, with the same access
					you have. Send it as{" "}
					<code className="[overflow-wrap:anywhere]">
						Authorization: Bearer &lt;token&gt;
					</code>
					.
				</>
			}
			className="space-y-4"
		>
			<CopyLink
				title="MCP endpoint"
				hint="Add it as an MCP server in AI agents like Claude Code and Cursor, and they open a browser for you to sign in. Agents without that can use a token."
				link={`${window.location.origin}/mcp`}
				copiedMessage="Address copied."
			/>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					form.handleSubmit();
				}}
			>
				<FieldGroup className="sm:grid sm:grid-cols-[minmax(0,1fr)_12rem]">
					<form.AppField
						name="name"
						children={(field) => (
							<field.TextField label="Token name" autoComplete="off" />
						)}
					/>
					<form.AppField
						name="expiry"
						children={(field) => (
							<field.SelectField label="Expires after" items={EXPIRY_ITEMS} />
						)}
					/>
				</FieldGroup>
				<form.AppForm>
					<form.SubscribeButton label="Create token" />
				</form.AppForm>
			</form>

			{newToken && (
				<CopyLink
					title={`Your new token, ${newToken.name}`}
					hint="It won't be shown again, so copy it now."
					link={newToken.token}
					copiedMessage="Token copied."
				/>
			)}

			{tokens && tokens.length > 0 && (
				<div className="flex flex-col gap-1">
					{tokens.map((token) => (
						<div
							key={token.id}
							className="flex items-center gap-3 rounded-md py-2"
						>
							<div className="flex min-w-0 flex-col">
								<span className="text-sm font-medium [overflow-wrap:anywhere]">
									{token.name}
								</span>
								<span className="text-xs text-muted-foreground">
									{token.oauth ? "Signed in through OAuth" : "Created"}{" "}
									{formatDate(token.createdAt)},{" "}
									{token.lastUsedAt === null
										? "never used"
										: `last used ${formatRelativeTime(token.lastUsedAt)}`}
									,{" "}
									{token.expiresAt === null
										? "no expiry"
										: `${token.expiresAt > Date.now() ? "expires" : "expired"} ${formatDate(token.expiresAt)}`}
								</span>
							</div>
							<div className="ml-auto">
								<ConfirmButton
									label={`Revoke ${token.name}`}
									buttonLabel="Revoke"
									title={`Revoke ${token.name}?`}
									description="Anything still using this token stops working right away. This can't be undone."
									confirmLabel="Revoke token"
									disabled={isRevoking}
									onConfirm={() => revoke({ id: token.id })}
								/>
							</div>
						</div>
					))}
				</div>
			)}
		</SettingsSection>
	);
}
