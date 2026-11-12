import { queryOptions } from "@tanstack/react-query";
import { orpc } from "../orpc";

export const instanceStatusQueryOptions = queryOptions({
	queryKey: ["instance-status"],
	queryFn: () => orpc.instance.status(),
});

export const instanceVersionQueryOptions = queryOptions({
	queryKey: ["instance-version"],
	queryFn: () => orpc.instance.version(),
	staleTime: Number.POSITIVE_INFINITY,
});

export const instanceUsersQueryOptions = queryOptions({
	queryKey: ["instance-users"],
	queryFn: () => orpc.instance.users(),
});

export const updateInstance = (input: { signupOpen: boolean }) =>
	orpc.instance.update(input);

export const createPasswordReset = ({
	userId,
}: {
	userId: string;
	displayName: string;
}) => orpc.instance.createPasswordReset({ userId });

export const markEmailVerified = ({ userId }: { userId: string }) =>
	orpc.instance.markEmailVerified({ userId });

export const sendTestEmail = () => orpc.instance.sendTestEmail();
