import { queryOptions } from "@tanstack/react-query";
import { orpc } from "../orpc";

export const instanceStatusQueryOptions = queryOptions({
	queryKey: ["instance-status"],
	queryFn: () => orpc.instance.status(),
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
