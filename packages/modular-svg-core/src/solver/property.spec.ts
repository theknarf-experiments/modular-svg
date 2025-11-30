import fc from "fast-check";
import { describe, it } from "vitest";
import { solveLayout } from ".";
import type { LayoutOperator, NodeRecord, StackAlignment } from "./operators";
import {
	alignXCenter,
	alignXCenterTo,
	alignXLeft,
	alignXRight,
	alignYBottom,
	alignYCenter,
	alignYTop,
	backgroundOp,
	distributeX,
	distributeY,
	stackH,
	stackV,
} from "./operators";

describe("property based primitives", () => {
	it("align left sets all x to min", () => {
		fc.assert(
			fc.property(
				fc.array(fc.integer({ min: -50, max: 50 }), {
					minLength: 2,
					maxLength: 5,
				}),
				(xs) => {
					const nodes: NodeRecord[] = xs.map((x, i) => ({
						id: `n${i}`,
						x,
						y: 0,
						width: 1,
						height: 1,
					}));
					const op = alignXLeft(nodes.map((_n, i) => i * 4));
					const scene = { nodes, operators: [op as LayoutOperator] };
					const result = solveLayout(scene, { damping: 1 });
					const min = Math.min(...xs);
					return nodes.every((_n, i) => result[`n${i}`].x === min);
				},
			),
		);
	});

	it("distribute x results in even spacing", () => {
		fc.assert(
			fc.property(
				fc.array(fc.integer({ min: -40, max: 40 }), {
					minLength: 3,
					maxLength: 6,
				}),
				(xs) => {
					const nodes: NodeRecord[] = xs.map((x, i) => ({
						id: `n${i}`,
						x,
						y: 0,
						width: 0,
						height: 0,
					}));
					const op = distributeX(nodes.map((_n, i) => i * 4));
					const scene = { nodes, operators: [op as LayoutOperator] };
					const result = solveLayout(scene, { damping: 1 });
					const min = Math.min(...xs);
					const max = Math.max(...xs);
					const gap = (max - min) / (xs.length - 1);
					return nodes.every(
						(_n, i) => Math.abs(result[`n${i}`].x - (min + i * gap)) < 1e-9,
					);
				},
			),
		);
	});

	it("align x center sets all centers equal", () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.record({
						x: fc.integer({ min: -40, max: 40 }),
						width: fc.integer({ min: 1, max: 20 }),
					}),
					{ minLength: 2, maxLength: 5 },
				),
				(vals) => {
					const nodes: NodeRecord[] = vals.map((v, i) => ({
						id: `n${i}`,
						x: v.x,
						y: 0,
						width: v.width,
						height: 1,
					}));
					const indices = vals.map((_v, i) => ({
						xIndex: i * 4,
						widthIndex: i * 4 + 2,
					}));
					const op = alignXCenter(indices);
					const scene = { nodes, operators: [op as LayoutOperator] };
					const result = solveLayout(scene, { damping: 1 });
					const centers = nodes.map(
						(_n, i) => result[`n${i}`].x + result[`n${i}`].width / 2,
					);
					return centers.every((c) => Math.abs(c - centers[0]) < 1e-9);
				},
			),
		);
	});

	it("align x center to anchor", () => {
		fc.assert(
			fc.property(
				fc.record({
					anchorX: fc.integer({ min: -40, max: 40 }),
					anchorWidth: fc.integer({ min: 1, max: 20 }),
					others: fc.array(
						fc.record({
							x: fc.integer({ min: -40, max: 40 }),
							width: fc.integer({ min: 1, max: 20 }),
						}),
						{ minLength: 1, maxLength: 4 },
					),
				}),
				({ anchorX, anchorWidth, others }) => {
					const anchor: NodeRecord = {
						id: "a",
						x: anchorX,
						y: 0,
						width: anchorWidth,
						height: 1,
					};
					const nodes: NodeRecord[] = [
						anchor,
						...others.map((o, i) => ({
							id: `n${i}`,
							x: o.x,
							y: 0,
							width: o.width,
							height: 1,
						})),
					];
					const op = alignXCenterTo(
						{ xIndex: 0, widthIndex: 2 },
						others.map((_o, i) => ({
							xIndex: (i + 1) * 4,
							widthIndex: (i + 1) * 4 + 2,
						})),
					);
					const scene = { nodes, operators: [op as LayoutOperator] };
					const result = solveLayout(scene, { damping: 1 });
					const center = result.a.x + result.a.width / 2;
					return others.every((_o, i) => {
						const r = result[`n${i}`];
						return Math.abs(r.x + r.width / 2 - center) < 1e-9;
					});
				},
			),
		);
	});

	it("align y top sets all y to min", () => {
		fc.assert(
			fc.property(
				fc.array(fc.integer({ min: -50, max: 50 }), {
					minLength: 2,
					maxLength: 5,
				}),
				(ys) => {
					const nodes: NodeRecord[] = ys.map((y, i) => ({
						id: `n${i}`,
						x: 0,
						y,
						width: 1,
						height: 1,
					}));
					const op = alignYTop(nodes.map((_n, i) => i * 4 + 1));
					const scene = { nodes, operators: [op as LayoutOperator] };
					const result = solveLayout(scene, { damping: 1 });
					const min = Math.min(...ys);
					return nodes.every((_n, i) => result[`n${i}`].y === min);
				},
			),
		);
	});

	it("align x right aligns right edges", () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.record({
						x: fc.integer({ min: -40, max: 40 }),
						width: fc.integer({ min: 0, max: 20 }),
					}),
					{ minLength: 2, maxLength: 5 },
				),
				(vals) => {
					const nodes: NodeRecord[] = vals.map((v, i) => ({
						id: `n${i}`,
						x: v.x,
						y: 0,
						width: v.width,
						height: 1,
					}));
					const op = alignXRight(
						vals.map((_v, i) => ({ xIndex: i * 4, widthIndex: i * 4 + 2 })),
					);
					const scene = { nodes, operators: [op as LayoutOperator] };
					const result = solveLayout(scene, { damping: 1 });
					const rights = nodes.map(
						(_n, i) => result[`n${i}`].x + result[`n${i}`].width,
					);
					return rights.every((r) => Math.abs(r - rights[0]) < 1e-9);
				},
			),
		);
	});

	it("align y center sets all centers equal", () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.record({
						y: fc.integer({ min: -40, max: 40 }),
						height: fc.integer({ min: 1, max: 20 }),
					}),
					{ minLength: 2, maxLength: 5 },
				),
				(vals) => {
					const nodes: NodeRecord[] = vals.map((v, i) => ({
						id: `n${i}`,
						x: 0,
						y: v.y,
						width: 1,
						height: v.height,
					}));
					const op = alignYCenter(
						vals.map((_v, i) => ({
							yIndex: i * 4 + 1,
							heightIndex: i * 4 + 3,
						})),
					);
					const scene = { nodes, operators: [op as LayoutOperator] };
					const result = solveLayout(scene, { damping: 1 });
					const centers = nodes.map(
						(_n, i) => result[`n${i}`].y + result[`n${i}`].height / 2,
					);
					return centers.every((c) => Math.abs(c - centers[0]) < 1e-9);
				},
			),
		);
	});

	it("align y bottom aligns bottom edges", () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.record({
						y: fc.integer({ min: -40, max: 40 }),
						height: fc.integer({ min: 0, max: 20 }),
					}),
					{ minLength: 2, maxLength: 5 },
				),
				(vals) => {
					const nodes: NodeRecord[] = vals.map((v, i) => ({
						id: `n${i}`,
						x: 0,
						y: v.y,
						width: 1,
						height: v.height,
					}));
					const op = alignYBottom(
						vals.map((_v, i) => ({
							yIndex: i * 4 + 1,
							heightIndex: i * 4 + 3,
						})),
					);
					const scene = { nodes, operators: [op as LayoutOperator] };
					const result = solveLayout(scene, { damping: 1 });
					const bottoms = nodes.map(
						(_n, i) => result[`n${i}`].y + result[`n${i}`].height,
					);
					return bottoms.every((b) => Math.abs(b - bottoms[0]) < 1e-9);
				},
			),
		);
	});

	it("distribute y results in even spacing", () => {
		fc.assert(
			fc.property(
				fc.array(fc.integer({ min: -40, max: 40 }), {
					minLength: 3,
					maxLength: 6,
				}),
				(ys) => {
					const nodes: NodeRecord[] = ys.map((y, i) => ({
						id: `n${i}`,
						x: 0,
						y,
						width: 0,
						height: 0,
					}));
					const op = distributeY(nodes.map((_n, i) => i * 4 + 1));
					const scene = { nodes, operators: [op as LayoutOperator] };
					const result = solveLayout(scene, { damping: 1 });
					const min = Math.min(...ys);
					const max = Math.max(...ys);
					const gap = (max - min) / (ys.length - 1);
					return nodes.every(
						(_n, i) => Math.abs(result[`n${i}`].y - (min + i * gap)) < 1e-9,
					);
				},
			),
		);
	});

	it("stack v stacks children and resizes container", () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.record({
						width: fc.integer({ min: 1, max: 20 }),
						height: fc.integer({ min: 1, max: 20 }),
					}),
					{ minLength: 1, maxLength: 4 },
				),
				fc.integer({ min: 0, max: 5 }),
				fc.constantFrom<StackAlignment>("left", "centerX", "right"),
				(sizes, spacing, align) => {
					const container: NodeRecord = {
						id: "container",
						x: 0,
						y: 0,
						width: 0,
						height: 0,
					};
					const nodes: NodeRecord[] = [
						container,
						...sizes.map((s, i) => ({
							id: `c${i}`,
							x: 0,
							y: 0,
							width: s.width,
							height: s.height,
						})),
					];
					const childIndices = sizes.map((_s, i) => ({
						base: (i + 1) * 4,
						node: nodes[i + 1],
					}));
					const op = stackV(childIndices, 0, spacing, align);
					const scene = { nodes, operators: [op as LayoutOperator] };
					const result = solveLayout(scene, { damping: 1 });
					const expectedWidth = Math.max(...sizes.map((s) => s.width));
					const expectedHeight =
						sizes.reduce((a, s) => a + s.height, 0) +
						spacing * (sizes.length - 1);
					if (Math.abs(result.container.width - expectedWidth) > 1e-9)
						return false;
					if (Math.abs(result.container.height - expectedHeight) > 1e-9)
						return false;
					let y = 0;
					for (let i = 0; i < sizes.length; i++) {
						const r = result[`c${i}`];
						if (Math.abs(r.y - y) > 1e-9) return false;
						let expectedX = 0;
						if (align === "centerX") {
							expectedX = (expectedWidth - sizes[i].width) / 2;
						} else if (align === "right") {
							expectedX = expectedWidth - sizes[i].width;
						}
						if (Math.abs(r.x - expectedX) > 1e-9) return false;
						y += sizes[i].height + spacing;
					}
					return true;
				},
			),
		);
	});

	it("stack h stacks children horizontally", () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.record({
						width: fc.integer({ min: 1, max: 20 }),
						height: fc.integer({ min: 1, max: 20 }),
					}),
					{ minLength: 1, maxLength: 4 },
				),
				fc.integer({ min: 0, max: 5 }),
				fc.constantFrom("top", "centerY", "bottom"),
				(sizes, spacing, align) => {
					const container: NodeRecord = {
						id: "box",
						x: 0,
						y: 0,
						width: 0,
						height: 0,
					};
					const nodes: NodeRecord[] = [
						container,
						...sizes.map((s, i) => ({
							id: `h${i}`,
							x: 0,
							y: 0,
							width: s.width,
							height: s.height,
						})),
					];
					const childIndices = sizes.map((_s, i) => ({
						base: (i + 1) * 4,
						node: nodes[i + 1],
					}));
					const op = stackH(
						childIndices,
						0,
						spacing,
						align as "top" | "centerY" | "bottom",
					);
					const scene = { nodes, operators: [op as LayoutOperator] };
					const result = solveLayout(scene, { damping: 1 });
					const expectedWidth =
						sizes.reduce((a, s) => a + s.width, 0) +
						spacing * (sizes.length - 1);
					const expectedHeight = Math.max(...sizes.map((s) => s.height));
					if (Math.abs(result.box.width - expectedWidth) > 1e-9) return false;
					if (Math.abs(result.box.height - expectedHeight) > 1e-9) return false;
					let x = 0;
					for (let i = 0; i < sizes.length; i++) {
						const r = result[`h${i}`];
						if (Math.abs(r.x - x) > 1e-9) return false;
						let expectedY = 0;
						if (align === "centerY") {
							expectedY = (expectedHeight - sizes[i].height) / 2;
						} else if (align === "bottom") {
							expectedY = expectedHeight - sizes[i].height;
						}
						if (Math.abs(r.y - expectedY) > 1e-9) return false;
						x += sizes[i].width + spacing;
					}
					return true;
				},
			),
		);
	});

	it("background expands box around child", () => {
		fc.assert(
			fc.property(
				fc.record({
					x: fc.integer({ min: -40, max: 40 }),
					y: fc.integer({ min: -40, max: 40 }),
					width: fc.integer({ min: 1, max: 20 }),
					height: fc.integer({ min: 1, max: 20 }),
					padding: fc.integer({ min: 0, max: 5 }),
				}),
				({ x, y, width, height, padding }) => {
					const child: NodeRecord = { id: "child", x, y, width, height };
					const box: NodeRecord = { id: "bg", x: 0, y: 0, width: 0, height: 0 };
					const nodes = [child, box];
					const op = backgroundOp(0, 4, padding);
					const scene = { nodes, operators: [op as LayoutOperator] };
					const result = solveLayout(scene, { damping: 1 });
					const b = result.bg;
					return (
						b.x === x - padding &&
						b.y === y - padding &&
						b.width === width + padding * 2 &&
						b.height === height + padding * 2
					);
				},
			),
		);
	});
});
