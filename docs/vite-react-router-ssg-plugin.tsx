//
//  This file is distributed under the MIT License
//

import { resolve } from "node:path";
import { finished } from "node:stream/promises";
import React from "react";
import { renderToPipeableStream } from "react-dom/server";
import {
	createStaticHandler,
	createStaticRouter,
	StaticRouterProvider,
} from "react-router";
import { WritableStreamBuffer } from "stream-buffers";
import type { Plugin } from "vite";

const routesToPaths = (routes, parentRoute = "") => {
	return routes.flatMap(({ path, children }) => {
		let currentPath = `${parentRoute}${path}`;

		// Remove special case where the path is two repeating slashes
		currentPath = currentPath.replace(/(\/)+/g, "/");
		// Remove trailing '*'
		currentPath = currentPath.replace(/\*$/, "");

		if (typeof children !== "undefined") {
			return routesToPaths(children, currentPath);
		}

		return currentPath;
	});
};

const renderHtml = async (path, routes, mainScript) => {
	const { query, dataRoutes } = createStaticHandler(routes);

	const url = new URL(path, "http://localhost/");
	url.search = "";
	url.hash = "";
	url.pathname = path;

	const context = await query(
		new Request(url.href, {
			signal: new AbortController().signal,
		}),
	);

	// If we got a redirect response, short circuit
	if (context instanceof Response) {
		throw context;
	}

	const router = createStaticRouter(dataRoutes, context);

	const app = (
		<html lang="en">
			<head>
				<meta charSet="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
			</head>
			<body>
				<div id="root">
					<React.StrictMode>
						<StaticRouterProvider router={router} context={context} />
					</React.StrictMode>
				</div>
				<script type="module" src={mainScript}></script>
			</body>
		</html>
	);

	const writableStream = new WritableStreamBuffer();
	const { pipe } = renderToPipeableStream(app, {
		onError(e) {
			throw e;
		},
		onAllReady() {
			pipe(writableStream);
		},
	});

	await finished(writableStream);
	return writableStream.getContentsAsString("utf8");
};

const fileNameFromPath = (path) => {
	let fileName = `${path}/index.html`;

	fileName = fileName.replace(/(\/)+/g, "/");
	fileName = fileName.replace(/^\//, "");

	fileName = resolve(__dirname, "src", fileName);

	return fileName;
};

function ssgPlugin({ routes, mainScript }): Plugin {
	const paths = routesToPaths(routes);

	return {
		name: "ssg-plugin",

		// Add all routes in the `paths` array as chunks
		buildStart() {
			paths.forEach((path) => {
				const id = fileNameFromPath(path);

				this.emitFile({
					type: "chunk",
					id,
				});
			});
		},

		// resolveId just matches up files that we later want to handle in load
		// without it we don't get to load the files in this plugin
		resolveId(id) {
			const file = paths.find((path) => {
				const idFromPath = fileNameFromPath(path);
				return idFromPath === id;
			});

			if (file) {
				return id;
			}
		},

		// build page
		async load(id) {
			const path = paths.find((p) => {
				const idFromPath = fileNameFromPath(p);
				return idFromPath === id;
			});

			if (path) {
				return await renderHtml(path, routes, mainScript);
			}

			return null;
		},
	};
}

export default ssgPlugin;
