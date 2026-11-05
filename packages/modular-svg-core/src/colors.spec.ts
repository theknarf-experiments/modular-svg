import { describe, expect, it } from "vitest";
import { contrastRatio, luminanceOfHsl, parseColor } from "./color.ts";
import { layoutToSvg } from "./output.ts";
import { buildSceneFromJson } from "./parser.ts";
import { solveLayout } from "./solver/index.ts";

function fills(json: Record<string, unknown>): Record<string, string> {
	const scene = buildSceneFromJson(json);
	const layout = solveLayout(scene);
	const out: Record<string, string> = {};
	for (const [id, box] of Object.entries(layout)) {
		if (box.fill) out[id] = box.fill;
	}
	return out;
}

describe("color constraints", () => {
	it("distinctColors assigns distinct hues to unpinned nodes", () => {
		const json = {
			type: "Group",
			id: "root",
			children: [
				{ type: "Rect", id: "a", props: { width: 10, height: 10 } },
				{ type: "Rect", id: "b", props: { width: 10, height: 10 } },
				{ type: "Rect", id: "c", props: { width: 10, height: 10 } },
				{
					type: "DistinctColors",
					children: [
						{ type: "Ref", target: "a" },
						{ type: "Ref", target: "b" },
						{ type: "Ref", target: "c" },
					],
				},
			],
		};
		const f = fills(json);
		expect(new Set([f.a, f.b, f.c]).size).toBe(3);
	});

	it("distinctColors keeps pinned colors and emits them into the svg", () => {
		const json = {
			type: "Group",
			id: "root",
			children: [
				{
					type: "Rect",
					id: "a",
					props: { width: 10, height: 10, fill: "#ff0000" },
				},
				{ type: "Rect", id: "b", props: { width: 10, height: 10 } },
				{
					type: "DistinctColors",
					children: [
						{ type: "Ref", target: "a" },
						{ type: "Ref", target: "b" },
					],
				},
			],
		};
		const scene = buildSceneFromJson(json);
		const layout = solveLayout(scene);
		expect(layout.a.fill).toBeUndefined();
		expect(layout.b.fill).toBeTruthy();
		const svg = layoutToSvg(layout, scene.nodes);
		expect(svg).toContain(`fill="${layout.b.fill}"`);
		expect(svg).toContain('fill="#ff0000"');
	});

	it("sameColor copies the source color onto targets", () => {
		const json = {
			type: "Group",
			id: "root",
			children: [
				{
					type: "Rect",
					id: "a",
					props: { width: 10, height: 10, fill: "#336699" },
				},
				{ type: "Rect", id: "b", props: { width: 10, height: 10 } },
				{
					type: "SameColor",
					children: [
						{ type: "Ref", target: "a" },
						{ type: "Ref", target: "b" },
					],
				},
			],
		};
		const f = fills(json);
		expect(f.b).toBe("#336699");
	});

	it("contrast adjusts the foreground to meet WCAG AA against the background", () => {
		const json = {
			type: "Group",
			id: "root",
			children: [
				{
					type: "Rect",
					id: "bg",
					props: { width: 40, height: 20, fill: "#f4e04d" },
				},
				{
					type: "Text",
					id: "label",
					props: { text: "hi", fill: "#f0f0f0", "font-size": 14 },
				},
				{
					type: "Contrast",
					children: [
						{ type: "Ref", target: "label" },
						{ type: "Ref", target: "bg" },
					],
				},
			],
		};
		const scene = buildSceneFromJson(json);
		const layout = solveLayout(scene);
		const fg = parseColor(layout.label.fill ?? "");
		const bg = parseColor("#f4e04d");
		expect(fg && bg).toBeTruthy();
		if (fg && bg) {
			const ratio = contrastRatio(
				luminanceOfHsl(fg.h, fg.s, fg.l),
				luminanceOfHsl(bg.h, bg.s, bg.l),
			);
			expect(ratio).toBeGreaterThanOrEqual(4.5);
		}
	});

	it("Lighten and Darken shift a source color's lightness", () => {
		const json = {
			type: "Group",
			id: "root",
			children: [
				{
					type: "Rect",
					id: "src",
					props: { width: 10, height: 10, fill: "#4C72B0" },
				},
				{ type: "Rect", id: "lite", props: { width: 10, height: 10 } },
				{ type: "Rect", id: "dark", props: { width: 10, height: 10 } },
				{
					type: "Lighten",
					props: { amount: 0.2 },
					children: [
						{ type: "Ref", target: "src" },
						{ type: "Ref", target: "lite" },
					],
				},
				{
					type: "Darken",
					props: { amount: 0.2 },
					children: [
						{ type: "Ref", target: "src" },
						{ type: "Ref", target: "dark" },
					],
				},
			],
		};
		const scene = buildSceneFromJson(json);
		const layout = solveLayout(scene);
		const src = parseColor("#4C72B0");
		const lite = parseColor(layout.lite.fill ?? "");
		const dark = parseColor(layout.dark.fill ?? "");
		expect(src && lite && dark).toBeTruthy();
		if (src && lite && dark) {
			// same hue, shifted lightness
			expect(lite.h).toBeCloseTo(src.h, 0);
			expect(lite.l).toBeGreaterThan(src.l);
			expect(dark.l).toBeLessThan(src.l);
		}
	});

	it("constraints chain: distinct backgrounds with contrasting labels", () => {
		const json = {
			type: "Group",
			id: "root",
			children: [
				{ type: "Rect", id: "p1", props: { width: 40, height: 20 } },
				{ type: "Rect", id: "p2", props: { width: 40, height: 20 } },
				{ type: "Text", id: "t1", props: { text: "one", "font-size": 12 } },
				{ type: "Text", id: "t2", props: { text: "two", "font-size": 12 } },
				{
					type: "DistinctColors",
					children: [
						{ type: "Ref", target: "p1" },
						{ type: "Ref", target: "p2" },
					],
				},
				{
					type: "Contrast",
					children: [
						{ type: "Ref", target: "t1" },
						{ type: "Ref", target: "p1" },
					],
				},
				{
					type: "Contrast",
					children: [
						{ type: "Ref", target: "t2" },
						{ type: "Ref", target: "p2" },
					],
				},
			],
		};
		const scene = buildSceneFromJson(json);
		const layout = solveLayout(scene);
		for (const [t, p] of [
			["t1", "p1"],
			["t2", "p2"],
		] as const) {
			const fg = parseColor(layout[t].fill ?? "");
			const bg = parseColor(layout[p].fill ?? "");
			expect(fg && bg).toBeTruthy();
			if (fg && bg) {
				const ratio = contrastRatio(
					luminanceOfHsl(fg.h, fg.s, fg.l),
					luminanceOfHsl(bg.h, bg.s, bg.l),
				);
				expect(ratio).toBeGreaterThanOrEqual(4.5);
			}
		}
	});
});

describe("color correctness", () => {
	it("blends hue the short way round", async () => {
		const { relax, angleDiff } = await import("./solver/solver.ts");
		expect(angleDiff(350, 10)).toBe(20);
		expect(angleDiff(10, 350)).toBe(-20);
		// one damped step from 350 toward 10 lands on 0, not 180
		const values = new Float64Array([350]);
		relax(
			values,
			[
				(_cur, next) => {
					next[0] = 10;
				},
			],
			{
				maxIter: 1,
				epsilon: 0,
				damping: 0.5,
				angles: { stride: 1, offset: 0 },
			},
		);
		expect(values[0]).toBe(0);
	});

	it("names color relations that cannot all hold", async () => {
		const { buildSceneFromJson, checkSolution } = await import("./parser.ts");
		const { solveLayout } = await import("./solver/index.ts");
		const ref = (target: string) => ({ type: "Ref", target });
		const rect = (id: string, fill?: string) => ({
			type: "Rect",
			id,
			props: { width: 10, height: 10, ...(fill ? { fill } : {}) },
		});
		const scene = buildSceneFromJson({
			type: "Group",
			children: [
				rect("red", "#ff0000"),
				rect("blue", "#0000ff"),
				rect("t"),
				{ type: "SameColor", children: [ref("red"), ref("t")] },
				{ type: "SameColor", children: [ref("blue"), ref("t")] },
			],
		});
		expect(checkSolution(scene, solveLayout(scene))).toEqual([
			"sameColor(red, t), sameColor(blue, t) cannot all hold; the colors did not settle",
		]);
	});
});

describe("perceptual colors", () => {
	const ref = (target: string) => ({ type: "Ref", target });
	const rect = (id: string, fill?: string) => ({
		type: "Rect",
		id,
		props: { width: 10, height: 10, ...(fill ? { fill } : {}) },
	});
	const solveFills = (children: unknown[]) =>
		fills({ type: "Group", id: "root", children });

	it("gives distinct colors one perceived lightness", async () => {
		const { parseRgba, luminance } = await import("./color.ts");
		const ids = ["a", "b", "c", "d", "e", "f"];
		const f = solveFills([
			...ids.map((id) => rect(id)),
			{ type: "DistinctColors", children: ids.map(ref) },
		]);
		const ys = ids.map((id) => {
			const c = parseRgba(f[id]);
			return c ? luminance(c.r, c.g, c.b) : Number.NaN;
		});
		// HSL gave luminance from 0.15 to 0.52 for the same nominal lightness
		expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(0.06);
	});

	it("steers generated hues away from a pinned one", async () => {
		const { parseRgba, rgbToOklch } = await import("./color.ts");
		const { angleDiff } = await import("./solver/solver.ts");
		const f = solveFills([
			rect("pinned", "#e03131"),
			rect("b"),
			rect("c"),
			rect("d"),
			{ type: "DistinctColors", children: ["pinned", "b", "c", "d"].map(ref) },
		]);
		const hue = (hex: string) => {
			const c = parseRgba(hex);
			return c ? rgbToOklch(c.r, c.g, c.b)[2] : Number.NaN;
		};
		const red = hue("#e03131");
		for (const id of ["b", "c", "d"])
			expect(Math.abs(angleDiff(red, hue(f[id])))).toBeGreaterThan(80);
	});

	it("carries alpha through relations", () => {
		const f = solveFills([
			rect("a", "rgba(51, 102, 153, 0.5)"),
			rect("b"),
			rect("c"),
			{ type: "SameColor", children: [ref("a"), ref("b")] },
			{
				type: "Darken",
				props: { amount: 0.1 },
				children: [ref("a"), ref("c")],
			},
		]);
		expect(f.b).toBe("#33669980");
		expect(f.c.endsWith("80")).toBe(true);
	});
});

describe("distinctHues (properties)", async () => {
	const fc = (await import("fast-check")).default;
	const { distinctHues } = await import("./solver/operators.ts");
	const { angleDiff } = await import("./solver/solver.ts");

	it("keeps pinned hues and spaces the free ones a full step from each other", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 2, max: 9 }).chain((n) =>
					fc.tuple(
						fc.constant(n),
						fc.array(
							fc.option(fc.integer({ min: 0, max: 359 }), {
								nil: undefined,
								freq: 2,
							}),
							{ minLength: n, maxLength: n },
						),
					),
				),
				fc.integer({ min: 0, max: 359 }),
				([n, pinned], start) => {
					const hues = distinctHues(n, start, pinned);
					expect(hues).toHaveLength(n);
					pinned.forEach((h, i) => {
						if (h !== undefined) expect(hues[i]).toBe(h);
					});
					const free = hues.filter((_, i) => pinned[i] === undefined);
					for (let i = 0; i < free.length; i++)
						for (let j = i + 1; j < free.length; j++)
							expect(Math.abs(angleDiff(free[i], free[j]))).toBeGreaterThan(
								360 / n - 1e-6,
							);
				},
			),
		);
	});
});

describe("fill and stroke", () => {
	const ref = (target: string, paint?: string) => ({
		type: "Ref",
		target,
		...(paint ? { paint } : {}),
	});
	const rect = (id: string, props: Record<string, unknown> = {}) => ({
		type: "Rect",
		id,
		props: { width: 10, height: 10, ...props },
	});
	const solve = (children: unknown[]) => {
		const scene = buildSceneFromJson({ type: "Group", id: "root", children });
		return { scene, layout: solveLayout(scene) };
	};

	it("relates a shape's stroke to its own fill", () => {
		const { scene, layout } = solve([
			rect("box", { fill: "#4c72b0" }),
			{
				type: "Darken",
				props: { amount: 0.2 },
				children: [ref("box"), ref("box", "stroke")],
			},
		]);
		expect(layout.box.fill).toBeUndefined();
		expect(layout.box.stroke).toBeTruthy();
		expect(layout.box.stroke).not.toBe("#4c72b0");
		expect(layoutToSvg(layout, scene.nodes)).toContain(
			`stroke="${layout.box.stroke}"`,
		);
	});

	it("gives fills and strokes their own distinct colors", () => {
		const { layout } = solve([
			rect("a"),
			rect("b"),
			{
				type: "DistinctColors",
				children: [ref("a", "stroke"), ref("b", "stroke")],
			},
		]);
		expect(layout.a.stroke).toBeTruthy();
		expect(layout.a.stroke).not.toBe(layout.b.stroke);
		expect(layout.a.fill).toBeUndefined();
	});

	it("keeps connectors on their stroke by default", () => {
		const { layout } = solve([
			{ type: "StackH", children: [rect("a", { fill: "#e03131" }), rect("b")] },
			{ type: "Line", id: "l", children: [ref("a"), ref("b")] },
			{ type: "SameColor", children: [ref("a"), ref("l")] },
		]);
		expect(layout.l.stroke).toBe("#e03131");
		expect(layout.l.fill).toBeUndefined();
	});

	it("treats an explicit stroke as pinned", () => {
		const { layout } = solve([
			rect("pinned", { stroke: "#123456" }),
			rect("free"),
			{
				type: "DistinctColors",
				children: [ref("pinned", "stroke"), ref("free", "stroke")],
			},
		]);
		expect(layout.pinned.stroke).toBeUndefined();
		expect(layout.free.stroke).toBeTruthy();
	});
});
