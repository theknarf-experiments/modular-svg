import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import routes from "./routes";

const rootElement = document.getElementById("root");
if (!rootElement) {
	throw new Error("Root element not found");
}

// react-router's basename tracks Vite's base so routing works under a
// subpath (e.g. /<repo>/ on GitHub Pages).
const router = createBrowserRouter(routes, {
	basename: import.meta.env.BASE_URL,
});

createRoot(rootElement).render(
	<StrictMode>
		<RouterProvider router={router} />
	</StrictMode>,
);
