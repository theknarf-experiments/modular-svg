import { spawnSync } from "node:child_process";
import { readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const bin = join(__dirname, "modular-svg");
const example = join(__dirname, "../examples/stack.json");

describe("CLI", () => {
	it("runs with stdin", () => {
		const json = readFileSync(example, "utf8");
		const out = join(__dirname, "tmp.svg");
		const { status } = spawnSync("npx", ["tsx", bin, "-", out], {
			input: json,
			encoding: "utf8",
		});
		expect(status).toBe(0);
		const svg = readFileSync(out, "utf8");
		expect(svg.startsWith("<svg")).toBe(true);
		unlinkSync(out);
	});
});
