import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react()],
	define: {
		// Skip schema validation in browser (parser.ts module-level code)
		"process.env.BROWSER": JSON.stringify(true),
	},
	optimizeDeps: {
		// Exclude Node.js built-ins from optimization
		exclude: ["node:fs", "node:path", "node:url"],
	},
});
