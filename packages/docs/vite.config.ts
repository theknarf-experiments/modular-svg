import { execSync } from "node:child_process";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Where this checkout came from, for the link back to the source. CI passes it
 * in; locally it falls out of the git remote, so it is never written down in
 * the app.
 */
function repoUrl(): string | undefined {
	if (process.env.VITE_REPO_URL) return process.env.VITE_REPO_URL;
	try {
		const remote = execSync("git remote get-url origin", {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
		const ssh = /^git@([^:]+):(.+?)(?:\.git)?$/.exec(remote);
		if (ssh) return `https://${ssh[1]}/${ssh[2]}`;
		return remote.replace(/\.git$/, "") || undefined;
	} catch {
		// No git or no remote: the link just does not render.
		return undefined;
	}
}

// Vite exposes VITE_-prefixed variables from the environment, so setting it
// here makes it reachable as `import.meta.env.VITE_REPO_URL`.
const repo = repoUrl();
if (repo) process.env.VITE_REPO_URL = repo;

export default defineConfig(() => ({
	root: "src",
	// Defaults to "/"; the GitHub Pages workflow sets DOCS_BASE to the repo
	// subpath so relative asset URLs resolve when deployed under /<repo>/.
	base: process.env.DOCS_BASE || "/",
	build: {
		outDir: "../dist",
		emptyOutDir: true,
		rollupOptions: {
			output: {
				manualChunks(id: string) {
					if (!id.includes("node_modules")) return;
					if (id.includes("shiki") || id.includes("@shikijs")) return "shiki";
					if (
						/[\\/](react|react-dom|react-router|react-reconciler|scheduler|its-fine)[\\/]/.test(
							id,
						)
					) {
						return "react-vendor";
					}
				},
			},
		},
	},
	plugins: [react()],
	define: {
		// Skip schema validation in browser (parser.ts module-level code)
		"process.env.BROWSER": JSON.stringify(true),
	},
	optimizeDeps: {
		// Exclude Node.js built-ins from optimization
		exclude: ["node:fs", "node:path", "node:url"],
	},
}));
