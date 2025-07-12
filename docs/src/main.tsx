import React from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import routes from "./routes";

const router = createBrowserRouter(routes);

const domNode = document.getElementById("root");
if (!domNode) throw new Error("Root not found");
const root = createRoot(domNode);

root.render(
	<React.StrictMode>
		<RouterProvider router={router} />
	</React.StrictMode>,
);
