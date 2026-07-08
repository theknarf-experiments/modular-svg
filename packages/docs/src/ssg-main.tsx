import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import routes from "./routes";

const rootElement = document.getElementById("root");
if (!rootElement) {
	throw new Error("Root element not found");
}

// react-router's basename tracks Vite's base so hydration lines up with
// the statically rendered pages served under a subpath.
const router = createBrowserRouter(routes, {
	basename: import.meta.env.BASE_URL,
});

hydrateRoot(
	rootElement,
	<StrictMode>
		<RouterProvider router={router} />
	</StrictMode>,
);
