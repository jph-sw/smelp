import { afterEach, describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "#/test/dom";
import { RichTextEditor } from "./rich-text-editor";

// Loaded after the DOM exists, because the API client reads the window's origin.
const { workItemKeyLinksQueryOptions } = await import("#/lib/data/issue");

describe("RichTextEditor work item keys", () => {
	afterEach(cleanup);

	test("shows links for the keys the API resolved, outside a router too", async () => {
		const queryClient = new QueryClient({
			defaultOptions: { queries: { staleTime: Infinity } },
		});
		queryClient.setQueryData(
			workItemKeyLinksQueryOptions({ keys: ["AB-1", "CD-2"] }).queryKey,
			[
				{
					id: "AB-1",
					title: "Fix login",
					workspaceId: "team",
					stateName: "Todo",
					stateColor: "#112233",
				},
			],
		);
		render(
			<QueryClientProvider client={queryClient}>
				<RichTextEditor
					value="blocked by AB-1 and CD-2, not `AB-1`"
					editable={false}
					aria-label="Comment"
				/>
			</QueryClientProvider>,
		);
		const link = await waitFor(() =>
			screen.getByRole("link", { name: "AB-1" }),
		);
		expect(link.getAttribute("href")).toBe("/team/browse/AB-1");
		expect(screen.getAllByRole("link")).toHaveLength(1);
	});
});
