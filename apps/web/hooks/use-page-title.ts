import { useEffect } from "react";

const APP_NAME = "smelp";

// Lives in the page rather than the route's head, so renaming an issue or project
// updates the tab straight away. Leaving the page goes back to the plain name, so a
// page without a title of its own never shows the previous page's.
export function usePageTitle(title: string) {
	useEffect(() => {
		document.title = `${title} · ${APP_NAME}`;
		return () => {
			document.title = APP_NAME;
		};
	}, [title]);
}
