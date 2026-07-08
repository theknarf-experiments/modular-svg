import { describe, expect, it } from "vitest";
import {
	expectShapesToMatch,
	renderBluefish,
	renderModular,
} from "./harness.ts";

// Geometry parity against real Bluefish (bluefishjs.org), rendered headlessly.
// Shapes are compared relative to the union bounding box, with tolerance for
// the damped fixed-point solver.
//
// Known, deliberate differences not covered here:
// - Text geometry: Bluefish measures real font metrics (stubbed to 0.6em/char
//   in this harness); modular-svg uses 8px/char. Text is excluded from
//   geometry fixtures.
// - Distribute without spacing: Bluefish throws, modular-svg spreads evenly
//   between the outermost children (an extension).
// - Arrows: Bluefish uses perfect-arrows; modular-svg draws a plain
//   line + polygon head.

const planetCircles = [
	{ r: 15, fill: "#EBE3CF" },
	{ r: 36, fill: "#DC933C" },
	{ r: 38, fill: "#179DD7" },
	{ r: 21, fill: "#F1CF8E" },
];

describe("stack parity", () => {
	it("StackH of circles with explicit spacing (planets row)", async () => {
		const reference = await renderBluefish((bf) =>
			bf.StackH(
				{ spacing: 50 },
				planetCircles.map((c) => bf.Circle({ ...c, "stroke-width": 3 })),
			),
		);
		const actual = renderModular({
			type: "StackH",
			id: "planets",
			props: { spacing: 50 },
			children: planetCircles.map((c, i) => ({
				type: "Circle",
				id: `p${i}`,
				props: c,
			})),
		});
		expectShapesToMatch(actual, reference);
	});

	it("StackH with default spacing and alignment", async () => {
		const rects = [
			{ width: 30, height: 10 },
			{ width: 10, height: 40 },
			{ width: 25, height: 25 },
		];
		const reference = await renderBluefish((bf) =>
			bf.StackH(
				{},
				rects.map((r) => bf.Rect(r)),
			),
		);
		const actual = renderModular({
			type: "StackH",
			id: "s",
			children: rects.map((r, i) => ({ type: "Rect", id: `r${i}`, props: r })),
		});
		expectShapesToMatch(actual, reference);
	});

	for (const alignment of ["left", "centerX", "right"] as const) {
		it(`StackV alignment ${alignment}`, async () => {
			const rects = [
				{ width: 30, height: 10 },
				{ width: 10, height: 40 },
				{ width: 60, height: 25 },
			];
			const reference = await renderBluefish((bf) =>
				bf.StackV(
					{ spacing: 7, alignment },
					rects.map((r) => bf.Rect(r)),
				),
			);
			const actual = renderModular({
				type: "StackV",
				id: "s",
				props: { spacing: 7, alignment },
				children: rects.map((r, i) => ({
					type: "Rect",
					id: `r${i}`,
					props: r,
				})),
			});
			expectShapesToMatch(actual, reference);
		});
	}

	for (const alignment of ["top", "centerY", "bottom"] as const) {
		it(`StackH alignment ${alignment}`, async () => {
			const rects = [
				{ width: 30, height: 10 },
				{ width: 10, height: 40 },
				{ width: 60, height: 25 },
			];
			const reference = await renderBluefish((bf) =>
				bf.StackH(
					{ spacing: 13, alignment },
					rects.map((r) => bf.Rect(r)),
				),
			);
			const actual = renderModular({
				type: "StackH",
				id: "s",
				props: { spacing: 13, alignment },
				children: rects.map((r, i) => ({
					type: "Rect",
					id: `r${i}`,
					props: r,
				})),
			});
			expectShapesToMatch(actual, reference);
		});
	}
});

describe("background parity", () => {
	it("Background with default padding around a stack", async () => {
		const reference = await renderBluefish((bf) =>
			bf.Background(
				{},
				bf.StackH(
					{ spacing: 20 },
					planetCircles.map((c) => bf.Circle(c)),
				),
			),
		);
		const actual = renderModular({
			type: "Background",
			id: "bg",
			children: [
				{
					type: "StackH",
					id: "s",
					props: { spacing: 20 },
					children: planetCircles.map((c, i) => ({
						type: "Circle",
						id: `p${i}`,
						props: c,
					})),
				},
			],
		});
		expectShapesToMatch(actual, reference);
	});

	it("Background with explicit padding", async () => {
		const reference = await renderBluefish((bf) =>
			bf.Background(
				{ padding: 40 },
				bf.StackH(
					{ spacing: 50 },
					planetCircles.map((c) => bf.Circle(c)),
				),
			),
		);
		const actual = renderModular({
			type: "Background",
			id: "bg",
			props: { padding: 40 },
			children: [
				{
					type: "StackH",
					id: "s",
					props: { spacing: 50 },
					children: planetCircles.map((c, i) => ({
						type: "Circle",
						id: `p${i}`,
						props: c,
					})),
				},
			],
		});
		expectShapesToMatch(actual, reference);
	});
});

describe("relational parity (align + distribute over refs)", () => {
	it("distribute horizontal with spacing", async () => {
		const reference = await renderBluefish((bf) =>
			bf.Distribute({ direction: "horizontal", spacing: 24 }, [
				bf.Rect({ width: 30, height: 10, x: 0, y: 0 }),
				bf.Rect({ width: 20, height: 20 }),
			]),
		);
		const actual = renderModular({
			type: "Group",
			id: "root",
			children: [
				{
					type: "Rect",
					id: "a",
					props: { width: 30, height: 10, x: 0, y: 0 },
				},
				{ type: "Rect", id: "b", props: { width: 20, height: 20 } },
				{
					type: "Distribute",
					id: "d",
					props: { axis: "x", spacing: 24 },
					children: [
						{ type: "Ref", target: "a" },
						{ type: "Ref", target: "b" },
					],
				},
			],
		});
		expectShapesToMatch(actual, reference);
	});

	it("the planets tutorial pattern: background + stack + align + distribute", async () => {
		// The original Bluefish planets tutorial, with the text label replaced
		// by a rect so text metrics stay out of the comparison.
		const reference = await renderBluefish((bf) => [
			bf.Background(
				{ padding: 40 },
				bf.StackH(
					{ spacing: 50 },
					planetCircles.map((c, i) =>
						bf.Circle({ ...c, name: i === 0 ? "mercury" : `p${i}` }),
					),
				),
			),
			bf.Align({ alignment: "centerX" }, [
				bf.Rect({ name: "label", width: 20, height: 10 }),
				bf.Ref({ select: "mercury" }),
			]),
			bf.Distribute({ direction: "vertical", spacing: 60 }, [
				bf.Ref({ select: "label" }),
				bf.Ref({ select: "mercury" }),
			]),
		]);
		const actual = renderModular({
			type: "Group",
			id: "root",
			children: [
				{
					type: "Background",
					id: "bg",
					props: { padding: 40 },
					children: [
						{
							type: "StackH",
							id: "planets",
							props: { spacing: 50 },
							children: planetCircles.map((c, i) => ({
								type: "Circle",
								id: i === 0 ? "mercury" : `p${i}`,
								props: c,
							})),
						},
					],
				},
				{ type: "Rect", id: "label", props: { width: 20, height: 10 } },
				{
					type: "Align",
					id: "al",
					props: { axis: "x", alignment: "center" },
					children: [
						{ type: "Ref", target: "label" },
						{ type: "Ref", target: "mercury" },
					],
				},
				{
					type: "Distribute",
					id: "di",
					props: { axis: "y", spacing: 60 },
					children: [
						{ type: "Ref", target: "label" },
						{ type: "Ref", target: "mercury" },
					],
				},
			],
		});
		expectShapesToMatch(actual, reference);
	});
});

describe("known divergences (fixtures flip to failing when fixed)", () => {
	// Bluefish gives every container a relative coordinate frame, so nesting
	// composes. modular-svg's stack operators write absolute coordinates
	// anchored at the origin, so the children of a nested stack detach from
	// where the outer stack places their container.
	it.fails("nested stacks compose", async () => {
		const reference = await renderBluefish((bf) =>
			bf.StackV({ spacing: 10, alignment: "left" }, [
				bf.Rect({ width: 20, height: 10 }),
				bf.StackH({ spacing: 5, alignment: "top" }, [
					bf.Rect({ width: 30, height: 10 }),
					bf.Rect({ width: 10, height: 20 }),
				]),
			]),
		);
		const actual = renderModular({
			type: "StackV",
			id: "outer",
			props: { spacing: 10, alignment: "left" },
			children: [
				{ type: "Rect", id: "a", props: { width: 20, height: 10 } },
				{
					type: "StackH",
					id: "inner",
					props: { spacing: 5, alignment: "top" },
					children: [
						{ type: "Rect", id: "b", props: { width: 30, height: 10 } },
						{ type: "Rect", id: "c", props: { width: 10, height: 20 } },
					],
				},
			],
		});
		expect(actual.length).toBe(reference.length);
		expectShapesToMatch(actual, reference);
	});

	// Bluefish stacks anchor on the first child whose position is already
	// owned by another relation (so a StackV [label, Ref(planet)] hangs the
	// label above the planet without moving it). modular-svg's stack always
	// repositions every child, dragging the referenced node out of its row.
	it.fails("StackV over a Ref leaves the referenced node in place", async () => {
		const reference = await renderBluefish((bf) => [
			bf.Background(
				{ padding: 40 },
				bf.StackH(
					{ spacing: 50 },
					planetCircles.map((c, i) =>
						bf.Circle({ ...c, name: i === 0 ? "mercury" : `p${i}` }),
					),
				),
			),
			bf.StackV({ spacing: 30 }, [
				bf.Rect({ width: 20, height: 10 }),
				bf.Ref({ select: "mercury" }),
			]),
		]);
		const actual = renderModular({
			type: "Group",
			id: "root",
			children: [
				{
					type: "Background",
					id: "bg",
					props: { padding: 40 },
					children: [
						{
							type: "StackH",
							id: "planets",
							props: { spacing: 50 },
							children: planetCircles.map((c, i) => ({
								type: "Circle",
								id: i === 0 ? "mercury" : `p${i}`,
								props: c,
							})),
						},
					],
				},
				{
					type: "StackV",
					id: "labelStack",
					props: { spacing: 30 },
					children: [
						{ type: "Rect", id: "label", props: { width: 20, height: 10 } },
						{ type: "Ref", target: "mercury" },
					],
				},
			],
		});
		expectShapesToMatch(actual, reference);
	});
});
