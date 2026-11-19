import { afterEach, describe, expect, mock, test } from "bun:test";
import type { ProjectMember } from "@smelp/db";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, userEvent } from "#/test/dom";
import { AssigneeSelect } from "./assignee-select";

const member = (userId: string, displayName: string) =>
	({ userId, displayName, fullName: displayName }) as ProjectMember;

const me = member("user-1", "Me");
const other = member("user-2", "Other");

function renderAssigneeSelect({
	value = null,
	members = [me, other],
	offerSelf = true,
}: {
	value?: string | null;
	members?: ProjectMember[];
	offerSelf?: boolean;
} = {}) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { enabled: false, staleTime: Infinity } },
	});
	queryClient.setQueryData(["auth", "me"], { id: me.userId });
	const onChange = mock((_: string | null) => {});
	render(
		<QueryClientProvider client={queryClient}>
			<AssigneeSelect
				value={value}
				members={members}
				offerSelf={offerSelf}
				onChange={onChange}
			/>
		</QueryClientProvider>,
	);
	return { user: userEvent.setup(), onChange };
}

const assignToMe = () => screen.queryByRole("button", { name: "Assign to me" });

describe("AssigneeSelect Assign to me", () => {
	// Testing Library's automatic cleanup binds only to the first DOM test file.
	afterEach(cleanup);

	test.each([
		["unassigned", null],
		["assigned to someone else", other.userId],
	])("is offered to a member when the item is %s", (_, value) => {
		renderAssigneeSelect({ value });
		expect(assignToMe()).toBeTruthy();
	});

	test("makes you the assignee and keeps focus on the picker", async () => {
		const { user, onChange } = renderAssigneeSelect({ value: other.userId });
		await user.click(assignToMe() as HTMLElement);
		expect(onChange.mock.calls).toEqual([[me.userId]]);
		expect(document.activeElement).toBe(
			screen.getByRole("button", { name: /^Assignee:/ }),
		);
	});

	test("is not offered when you are already the assignee", () => {
		renderAssigneeSelect({ value: me.userId });
		expect(assignToMe()).toBeNull();
	});

	test("is not offered when you are not a project member", () => {
		renderAssigneeSelect({ members: [other] });
		expect(assignToMe()).toBeNull();
	});

	test("is not offered unless the caller asks for it", () => {
		renderAssigneeSelect({ offerSelf: false });
		expect(assignToMe()).toBeNull();
	});
});
