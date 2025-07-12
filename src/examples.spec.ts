import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import { describe, expect, it } from "vitest";

const base = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(base, "../examples");
const schema = JSON.parse(
	readFileSync(join(base, "../scene.schema.json"), "utf8"),
);

const ajv = new Ajv();
const validate = ajv.compile(schema);

describe("example json files", () => {
	for (const file of readdirSync(examplesDir)) {
		if (!file.endsWith(".json")) continue;
		it(`validates ${file}`, () => {
			const data = JSON.parse(readFileSync(join(examplesDir, file), "utf8"));
			expect(validate(data)).toBe(true);
		});
	}
});
