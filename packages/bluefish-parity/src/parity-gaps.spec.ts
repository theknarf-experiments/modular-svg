import { describe, it } from "vitest";
import {
	expectPaintOrderToMatch,
	expectShapesToMatch,
	renderBluefish,
	renderModular,
	renderModularSvg,
} from "./harness.ts";

// Fixtures for the gaps closed after the initial parity suite: zOrder,
// Image, stack/distribute total modes, Line, and Circle cx/cy. See PARITY.md.
// Arrow geometry deliberately diverges (straight arrows, no perfect-arrows).

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
