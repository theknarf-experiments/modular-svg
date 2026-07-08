import { Layout, PageContent, pages } from "./App";
import "./modular-svg.d.ts";

// Shared route config for both the client (createBrowserRouter) and the
// static site generator (createStaticHandler). Child paths are relative to
// the "/" parent; the home page uses an empty path so ssg-for-vite derives
// "/" for it.
const routes = [
	{
		path: "/",
		element: <Layout />,
		children: pages.map((p) => ({
			path: p.path === "/" ? "" : p.path.replace(/^\//, ""),
			element: <PageContent page={p} />,
		})),
	},
];

export default routes;
