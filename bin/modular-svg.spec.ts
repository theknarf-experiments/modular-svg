import { spawnSync } from "node:child_process";
import { readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSceneFromJson, layoutToSvg, solveLayout } from "../src/index";

const bin = join(__dirname, "modular-svg");
const example = join(__dirname, "../examples/stack.json");

describe("CLI", () => {
	it("uses default margin", () => {
		const json = readFileSync(example, "utf8");
		const out = join(__dirname, "tmp.svg");
		const { status } = spawnSync(bin, ["-", out], {
			input: json,
			encoding: "utf8",
		});
		expect(status).toBe(0);
		const svg = readFileSync(out, "utf8");
		const scene = buildSceneFromJson(JSON.parse(json));
		const layout = solveLayout(scene);
		const expected = layoutToSvg(layout, scene.nodes, 3);
		expect(svg.trim()).toBe(expected);
		unlinkSync(out);
	});

	it("allows setting margin", () => {
		const json = readFileSync(example, "utf8");
		const out = join(__dirname, "tmp.svg");
		const { status } = spawnSync(bin, ["-", out, "--margin", "10"], {
			input: json,
			encoding: "utf8",
		});
		expect(status).toBe(0);
		const svg = readFileSync(out, "utf8");
		const scene = buildSceneFromJson(JSON.parse(json));
		const layout = solveLayout(scene);
		const expected = layoutToSvg(layout, scene.nodes, 10);
		expect(svg.trim()).toBe(expected);
		unlinkSync(out);
	});
});
