import App from "./app.tsx";
import { routes as blogRoutes } from "./blog";
import Blog from "./pages/Blog";
import Home from "./pages/Home";
import Post from "./pages/Post";

const routes = [
	{
		path: "/",
		element: <App />,
		children: [
			{
				path: "/",
				element: <Home />,
			},
			{
				path: "post/",
				element: <Blog />,
			},
			{
				path: "post/*",
				element: <Post />,
				children: [...blogRoutes],
			},
		],
	},
];

export default routes;
