import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import routes from "./routes";

const rootElement = document.getElementById("root");
if (!rootElement) {
	throw new Error("Root element not found");
}

const router = createBrowserRouter(routes);

hydrateRoot(
	rootElement,
	<StrictMode>
		<RouterProvider router={router} />
	</StrictMode>,
);
