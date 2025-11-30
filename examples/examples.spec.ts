import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validate } from "../packages/modular-svg-core/src/parser";

const examplesDir = dirname(fileURLToPath(import.meta.url));

describe("example json files", () => {
	for (const file of readdirSync(examplesDir)) {
		if (!file.endsWith(".json")) continue;
		it(`validates ${file}`, () => {
			const data = JSON.parse(readFileSync(join(examplesDir, file), "utf8"));
			expect(() => validate(data)).not.toThrow();
		});
	}
});
