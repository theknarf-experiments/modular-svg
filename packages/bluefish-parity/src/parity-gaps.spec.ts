import { describe, expect, it } from "vitest";
import {
	expectPaintOrderToMatch,
	expectShapesToMatch,
	renderBluefish,
	renderBluefishSvg,
	renderModular,
	renderModularSvg,
} from "./harness.ts";

// Fixtures for the gaps closed after the initial parity suite: zOrder,
// Image, stack/distribute total modes, Line, perfect-arrows Arrow geometry,
// and Circle cx/cy. See PARITY.md.

describe("zOrder", () => {
	it("controls paint order like Bluefish", async () => {
		const reference = await renderBluefish((bf) => [
			bf.Group({}, [
				bf.Circle({ name: "a", cx: 20, cy: 20, r: 15, zOrder: 2 }),
				bf.Circle({ name: "b", cx: 35, cy: 20, r: 15, zOrder: 1 }),
				bf.Circle({ name: "c", cx: 50, cy: 20, r: 15 }),
			]),
		]);
		const { shapes: actual } = renderModularSvg({
			type: "Group",
			id: "g",
			children: [
				{
					type: "Circle",
					id: "a",
					props: { cx: 20, cy: 20, r: 15, zOrder: 2 },
				},
				{
					type: "Circle",
					id: "b",
					props: { cx: 35, cy: 20, r: 15, zOrder: 1 },
				},
				{ type: "Circle", id: "c", props: { cx: 50, cy: 20, r: 15 } },
			],
		});
		expectPaintOrderToMatch(actual, reference);
	});
});

describe("Image", () => {
	it("lays out like a rect in a stack", async () => {
		const reference = await renderBluefish((bf) =>
			bf.StackH({ spacing: 12 }, [
				bf.Image({ width: 40, height: 30, href: "cat.png" }),
				bf.Rect({ width: 20, height: 50 }),
			]),
		);
		const actual = renderModular({
			type: "StackH",
			id: "s",
			props: { spacing: 12 },
			children: [
				{
					type: "Image",
					id: "i",
					props: { width: 40, height: 30, href: "cat.png" },
				},
				{ type: "Rect", id: "r", props: { width: 20, height: 50 } },
			],
		});
		expectShapesToMatch(actual, reference);
	});
});

describe("stack total modes", () => {
	const rects = [
		{ width: 30, height: 20 },
		{ width: 50, height: 40 },
		{ width: 20, height: 30 },
	];

	it("total only computes the spacing", async () => {
		const reference = await renderBluefish((bf) =>
			bf.StackH(
				{ total: 200 },
				rects.map((r) => bf.Rect(r)),
			),
		);
		const actual = renderModular({
			type: "StackH",
			id: "s",
			props: { total: 200 },
			children: rects.map((r, i) => ({ type: "Rect", id: `r${i}`, props: r })),
		});
		expectShapesToMatch(actual, reference);
	});

	it("total + spacing assigns leftover extent to unsized children", async () => {
		const reference = await renderBluefish((bf) =>
			bf.StackH({ total: 200, spacing: 10 }, [
				bf.Rect({ width: 30, height: 20 }),
				bf.Rect({ height: 20 }),
				bf.Rect({ width: 50, height: 20 }),
			]),
		);
		const actual = renderModular({
			type: "StackH",
			id: "s",
			props: { total: 200, spacing: 10 },
			children: [
				{ type: "Rect", id: "a", props: { width: 30, height: 20 } },
				{ type: "Rect", id: "b", props: { height: 20 } },
				{ type: "Rect", id: "c", props: { width: 50, height: 20 } },
			],
		});
		expectShapesToMatch(actual, reference);
	});

	it("distribute with total only computes the spacing", async () => {
		const reference = await renderBluefish((bf) => [
			bf.Rect({ name: "a", x: 0, y: 0, width: 40, height: 20 }),
			bf.Rect({ name: "b", width: 60, height: 35 }),
			bf.Distribute({ direction: "horizontal", total: 300 }, [
				bf.Ref({ select: "a" }),
				bf.Ref({ select: "b" }),
			]),
		]);
		const actual = renderModular({
			type: "Group",
			id: "root",
			children: [
				{ type: "Rect", id: "a", props: { x: 0, y: 0, width: 40, height: 20 } },
				{ type: "Rect", id: "b", props: { width: 60, height: 35 } },
				{
					type: "Distribute",
					id: "d",
					props: { direction: "horizontal", total: 300 },
					children: [
						{ type: "Ref", target: "a" },
						{ type: "Ref", target: "b" },
					],
				},
			],
		});
		expectShapesToMatch(actual, reference);
	});
});

describe("Line", () => {
	const lineScene = (
		source: number[] | undefined,
		target: number[] | undefined,
	) => ({
		type: "Group",
		id: "root",
		children: [
			{
				type: "Rect",
				id: "a",
				props: { x: 0, y: 0, width: 40, height: 30, "stroke-width": 0 },
			},
			{
				type: "Rect",
				id: "b",
				props: { x: 100, y: 80, width: 40, height: 30, "stroke-width": 0 },
			},
			{
				type: "Line",
				id: "l",
				props: { ...(source ? { source } : {}), ...(target ? { target } : {}) },
				children: [
					{ type: "Ref", target: "a" },
					{ type: "Ref", target: "b" },
				],
			},
		],
	});

	const lineDiagram =
		(source: number[] | undefined, target: number[] | undefined) =>
		// biome-ignore lint/suspicious/noExplicitAny: bluefish module type
		(bf: any) => [
			bf.Rect({ name: "a", x: 0, y: 0, width: 40, height: 30 }),
			bf.Rect({ name: "b", x: 100, y: 80, width: 40, height: 30 }),
			bf.Line(
				{ ...(source ? { source } : {}), ...(target ? { target } : {}) },
				[bf.Ref({ select: "a" }), bf.Ref({ select: "b" })],
			),
		];

	it("with explicit fractional source and target anchors", async () => {
		const reference = await renderBluefish(lineDiagram([0.5, 1], [0.5, 0]));
		const { shapes: actual } = renderModularSvg(lineScene([0.5, 1], [0.5, 0]));
		expectShapesToMatch(actual, reference);
	});

	it("with only a source anchor (target clamped)", async () => {
		const reference = await renderBluefish(lineDiagram([1, 0.5], undefined));
		const { shapes: actual } = renderModularSvg(lineScene([1, 0.5], undefined));
		expectShapesToMatch(actual, reference);
	});

	it("with no anchors (center-biased boundary points)", async () => {
		const reference = await renderBluefish(lineDiagram(undefined, undefined));
		const { shapes: actual } = renderModularSvg(
			lineScene(undefined, undefined),
		);
		expectShapesToMatch(actual, reference);
	});
});

describe("Arrow (perfect-arrows geometry)", () => {
	function quadNumbers(svg: string): number[] {
		const m =
			/d="M(-?[\d.e+]+),(-?[\d.e+]+) Q(-?[\d.e+]+),(-?[\d.e+]+) (-?[\d.e+]+),(-?[\d.e+]+)"/.exec(
				svg,
			);
		if (!m) throw new Error(`no quadratic path in svg: ${svg.slice(0, 300)}`);
		return m.slice(1).map(Number);
	}

	function polygonParts(svg: string): { points: string; transform: number[] } {
		const m =
			/<polygon points="([^"]+)" transform="translate\((-?[\d.e+]+),\s*(-?[\d.e+]+)\) rotate\((-?[\d.e+]+)\)"/.exec(
				svg,
			);
		if (!m) throw new Error(`no polygon in svg: ${svg.slice(0, 300)}`);
		return { points: m[1], transform: m.slice(2).map(Number) };
	}

	// The frame origin is the top-left rect corner (rect "a" sits at 0,0 with
	// no stroke), letting us compare path coordinates across both systems.
	function frameOrigin(shapes: { kind: string; x: number; y: number }[]): {
		ox: number;
		oy: number;
	} {
		const rects = shapes.filter((s) => s.kind === "rect");
		return {
			ox: Math.min(...rects.map((r) => r.x)),
			oy: Math.min(...rects.map((r) => r.y)),
		};
	}

	it("matches Bluefish's curved arrow exactly", async () => {
		const { svg: refSvg, shapes: refShapes } = await renderBluefishSvg(
			// biome-ignore lint/suspicious/noExplicitAny: bluefish module type
			(bf: any) => [
				bf.Rect({ name: "a", x: 0, y: 0, width: 40, height: 30 }),
				bf.Rect({ name: "b", x: 120, y: 90, width: 40, height: 30 }),
				bf.Arrow({}, [bf.Ref({ select: "a" }), bf.Ref({ select: "b" })]),
			],
		);
		const { svg: actSvg, shapes: actShapes } = renderModularSvg({
			type: "Group",
			id: "root",
			children: [
				{
					type: "Rect",
					id: "a",
					props: { x: 0, y: 0, width: 40, height: 30, "stroke-width": 0 },
				},
				{
					type: "Rect",
					id: "b",
					props: { x: 120, y: 90, width: 40, height: 30, "stroke-width": 0 },
				},
				{
					type: "Arrow",
					id: "arrow",
					children: [
						{ type: "Ref", target: "a" },
						{ type: "Ref", target: "b" },
					],
				},
			],
		});

		const refO = frameOrigin(refShapes);
		const actO = frameOrigin(actShapes);
		const refQuad = quadNumbers(refSvg);
		const actQuad = quadNumbers(actSvg);
		for (let i = 0; i < 6; i++) {
			const refV = refQuad[i] - (i % 2 === 0 ? refO.ox : refO.oy);
			const actV = actQuad[i] - (i % 2 === 0 ? actO.ox : actO.oy);
			expect(actV).toBeCloseTo(refV, 3);
		}

		const refPoly = polygonParts(refSvg);
		const actPoly = polygonParts(actSvg);
		expect(actPoly.points).toBe(refPoly.points);
		expect(actPoly.transform[0] - actO.ox).toBeCloseTo(
			refPoly.transform[0] - refO.ox,
			3,
		);
		expect(actPoly.transform[1] - actO.oy).toBeCloseTo(
			refPoly.transform[1] - refO.oy,
			3,
		);
		expect(actPoly.transform[2]).toBeCloseTo(refPoly.transform[2], 3);
	});
});

describe("Circle cx/cy", () => {
	it("center-anchored circles match", async () => {
		const reference = await renderBluefish((bf) => [
			bf.Rect({ name: "o", x: 0, y: 0, width: 10, height: 10 }),
			bf.Circle({ name: "c", cx: 50, cy: 30, r: 10 }),
		]);
		const actual = renderModular({
			type: "Group",
			id: "root",
			children: [
				{ type: "Rect", id: "o", props: { x: 0, y: 0, width: 10, height: 10 } },
				{ type: "Circle", id: "c", props: { cx: 50, cy: 30, r: 10 } },
			],
		});
		expectShapesToMatch(actual, reference);
	});
});
