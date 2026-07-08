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
