import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { watchSystemTheme } from "#/lib/theme";
import { queryClient, router } from "./router";

import "./styles.css";

const Devtools = import.meta.env.DEV
	? lazy(() => import("./devtools"))
	: () => null;

const rootElement = document.getElementById("root");
if (!rootElement) {
	throw new Error("root element not found");
}

watchSystemTheme();

createRoot(rootElement).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
			<Suspense>
				<Devtools />
			</Suspense>
		</QueryClientProvider>
	</StrictMode>,
);
