import React from "react";
import { hydrateRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import routes from "./routes";

const router = createBrowserRouter(routes);
const domNode = document.getElementById("root");
if (!domNode) throw new Error("Root not found");

hydrateRoot(
	domNode,
	<React.StrictMode>
		<RouterProvider router={router} />
	</React.StrictMode>,
);
