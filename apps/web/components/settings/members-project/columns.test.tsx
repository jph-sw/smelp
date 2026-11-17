import { describe, expect, mock, test } from "bun:test";
import type { ProjectMember } from "@smelp/db";
import { act, render, screen, setupDom, userEvent, within } from "#/test/dom";
import { canManageMembers, createColumns } from "./columns";
import { DataTable } from "./data-table";

setupDom();

const member = (id: string, fullName: string) =>
	({
		id,
		userId: `user-${id}`,
		fullName,
		displayName: fullName.split(" ")[0],
		email: `${id}@example.com`,
		role: "member",
		image: null,
		createdAt: new Date("2026-01-01"),
	}) as unknown as ProjectMember;

const ana = member("ana", "Ana Lopez");
const ben = member("ben", "Ben Okafor");

function renderMembers({
	canRemove,
	onRemove = async () => {},
}: {
	canRemove: boolean;
	onRemove?: (member: ProjectMember) => Promise<void>;
}) {
	render(
		<DataTable
			columns={createColumns({ canRemove, onRemove })}
			data={[ana, ben]}
		/>,
	);
	return userEvent.setup();
}

const removeButtons = () =>
	screen.queryAllByRole("button", { name: "Remove member" });

async function openRemoveDialog(
	user: ReturnType<typeof userEvent.setup>,
	row: number,
) {
	await user.click(removeButtons()[row]);
	return within(screen.getByRole("alertdialog"));
}

describe("canManageMembers", () => {
	const cases = [
		{ instanceRole: "admin", projectRole: undefined, expected: true },
		{ instanceRole: null, projectRole: "admin", expected: true },
		{ instanceRole: null, projectRole: "member", expected: false },
		{ instanceRole: null, projectRole: "guest", expected: false },
		{ instanceRole: "user", projectRole: undefined, expected: false },
		{ instanceRole: undefined, projectRole: undefined, expected: false },
	] as const;

	for (const { instanceRole, projectRole, expected } of cases) {
		test(`instance ${instanceRole}, project ${projectRole}: ${expected}`, () => {
			expect(
				canManageMembers({ isArchived: false, instanceRole, projectRole }),
			).toBe(expected);
		});
	}

	test("nobody manages the members of an archived project", () => {
		expect(
			canManageMembers({
				isArchived: true,
				instanceRole: "admin",
				projectRole: "admin",
			}),
		).toBe(false);
	});
});

describe("members table", () => {
	test("shows a remove action on every row for someone who can remove", () => {
		renderMembers({ canRemove: true });
		expect(removeButtons()).toHaveLength(2);
	});

	test("hides the remove action from everyone else", () => {
		renderMembers({ canRemove: false });
		expect(screen.getAllByRole("row")).toHaveLength(3);
		expect(removeButtons()).toHaveLength(0);
		expect(
			screen.getAllByRole("columnheader").map((h) => h.textContent),
		).toEqual(["Full name", "Display name", "Email", "Role", "Joining date"]);
	});

	test("asks before removing, naming the member", async () => {
		const user = renderMembers({ canRemove: true });
		const dialog = await openRemoveDialog(user, 1);
		expect(dialog.getByRole("heading").textContent).toBe("Remove Ben Okafor?");
	});

	test("Cancel keeps the member", async () => {
		const onRemove = mock(async () => {});
		const user = renderMembers({ canRemove: true, onRemove });
		const dialog = await openRemoveDialog(user, 1);
		await user.click(dialog.getByRole("button", { name: "Cancel" }));
		expect(onRemove).not.toHaveBeenCalled();
		expect(screen.queryByRole("alertdialog")).toBeNull();
	});

	test("Remove member removes that row's member", async () => {
		const onRemove = mock(async (_: ProjectMember) => {});
		const user = renderMembers({ canRemove: true, onRemove });
		const dialog = await openRemoveDialog(user, 1);
		await user.click(dialog.getByRole("button", { name: "Remove member" }));
		expect(onRemove).toHaveBeenCalledTimes(1);
		expect(onRemove.mock.calls[0][0]).toBe(ben);
		expect(screen.queryByRole("alertdialog")).toBeNull();
	});

	test("keeps the dialog open while the removal runs", async () => {
		let finish = () => {};
		const onRemove = () =>
			new Promise<void>((resolve) => {
				finish = resolve;
			});
		const user = renderMembers({ canRemove: true, onRemove });
		const dialog = await openRemoveDialog(user, 0);
		const confirm = dialog.getByRole("button", { name: "Remove member" });
		await user.click(confirm);
		try {
			expect(screen.queryByRole("alertdialog")).not.toBeNull();
			expect(confirm.getAttribute("aria-busy")).toBe("true");
			await user.click(dialog.getByRole("button", { name: "Cancel" }));
			expect(screen.queryByRole("alertdialog")).not.toBeNull();
		} finally {
			await act(async () => finish());
		}
		expect(screen.queryByRole("alertdialog")).toBeNull();
	});
});
