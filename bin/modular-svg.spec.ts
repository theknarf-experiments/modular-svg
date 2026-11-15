import { spawnSync } from "node:child_process";
import { readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	buildSceneFromJson,
	layoutToSvg,
	solveLayout,
} from "../packages/modular-svg-core/src/index.ts";

const bin = join(__dirname, "modular-svg.ts");
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

	it("fits the canvas into --width and --height", () => {
		const json = readFileSync(example, "utf8");
		const { status, stdout } = spawnSync(
			bin,
			["-", "-", "--margin", "0", "--width", "640", "--height", "360"],
			{ input: json, encoding: "utf8" },
		);
		expect(status).toBe(0);
		const scene = buildSceneFromJson(JSON.parse(json));
		const layout = solveLayout(scene);
		expect(stdout).toBe(
			layoutToSvg(layout, scene.nodes, 0, {
				view: { width: 640, height: 360 },
			}),
		);
		expect(stdout).toContain('width="640" height="360" viewBox="0 0 640 360"');
	});
	const run = (scene: unknown, ...args: string[]) =>
		spawnSync(bin, ["-", "-", ...args], {
			input: typeof scene === "string" ? scene : JSON.stringify(scene),
			encoding: "utf8",
		});
	const rect = (id: string) => ({
		type: "Rect",
		id,
		props: { width: 40, height: 20 },
	});
	const ref = (target: string) => ({ type: "Ref", target });
	const root = (...children: unknown[]) => ({
		type: "Group",
		id: "root",
		children,
	});

	it("says nothing on stderr for a scene with nothing to warn about", () => {
		for (const scene of [
			readFileSync(join(__dirname, "../examples/pipeline.json"), "utf8"),
			root(rect("a")),
		]) {
			const { status, stderr, stdout } = run(scene);
			expect(status).toBe(0);
			expect(stderr).toBe("");
			expect(stdout).toContain("<svg");
		}
	});

	it("warns about a value the parser reads as a default, and still renders", () => {
		const clip = (type: string, props: object) => ({
			type,
			id: "c",
			props,
			children: [rect("s"), rect("k")],
		});
		const travel = (props: object) => ({
			type: "Travel",
			id: "t",
			props,
			children: [ref("a"), ref("b")],
		});
		const cases: [unknown, string][] = [
			[
				root(rect("a"), {
					type: "Camera",
					id: "cam",
					props: { fit: "fill" },
					children: [ref("a")],
				}),
				'warning: Camera(cam): fit must be "contain" or "cover"; using contain',
			],
			[
				root(clip("Clip", { feather: -1 })),
				"warning: Clip(c): feather must be 0 or more; read as 0",
			],
			[
				root(clip("Mask", { by: "light" })),
				'warning: Mask(c): by must be "alpha" or "luminance"; read as "alpha"',
			],
			[
				root(rect("a"), rect("b"), travel({ route: "wiggly" })),
				'warning: Travel(t): route must be "straight", "smooth" or "along", got "wiggly"',
			],
			[
				root(rect("a"), rect("b"), travel({ pace: "fast" })),
				'warning: Travel(t): pace must be "leg" or "trip", got "fast"',
			],
			[
				root(rect("a"), rect("b"), travel({ orient: "yes" })),
				'warning: Travel(t): orient must be true or an angle in degrees, got "yes"',
			],
		];
		for (const [scene, warning] of cases) {
			const { status, stderr, stdout } = run(scene);
			expect(stderr.trim().split("\n")).toContain(warning);
			expect(stderr).not.toContain("Error");
			expect(status, warning).toBe(0);
			expect(stdout).toContain("</svg>");
		}
	});

	it("refuses a scene the schema cannot read before it renders", () => {
		const { status, stderr, stdout } = run(root({ type: "Blob", id: "x" }));
		expect(status).toBe(1);
		expect(stderr).toContain("Invalid scene:");
		expect(stdout).toBe("");
	});

	it("takes --aspect, and rounds the side it works out", () => {
		const scene = root({
			type: "Rect",
			id: "a",
			props: { width: 49, height: 29, "stroke-width": 0 },
		});
		expect(run(scene, "--margin", "0", "--width", "640").stdout).toContain(
			'width="640" height="379" viewBox="0 0 640 379"',
		);
		expect(run(scene, "--margin", "0", "--height", "100").stdout).toContain(
			'width="169" height="100" viewBox="0 0 169 100"',
		);
		expect(
			run(scene, "--margin", "0", "--width", "640", "--aspect", "1.6").stdout,
		).toContain('width="640" height="400" viewBox="0 0 640 400"');
	});
});
