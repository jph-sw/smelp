import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { queryClient, router } from "./router";
import "./styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
	throw new Error("root element not found");
}

const darkMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
darkMediaQuery.addEventListener("change", (e) => {
	document.documentElement.classList.toggle("dark", e.matches);
});

createRoot(rootElement).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
		</QueryClientProvider>
	</StrictMode>,
);
