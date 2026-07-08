import fc from "fast-check";
import { describe, it } from "vitest";
import { solveLayout } from "./index.ts";
import type { LayoutOperator, NodeRecord, SubtreeChild } from "./operators.ts";
import {
	alignX,
	alignY,
	backgroundOp,
	distributeX,
	distributeY,
	stackH,
	stackV,
	unionOp,
} from "./operators.ts";

function leafNodes(
	boxes: { x?: number; y?: number; width?: number; height?: number }[],
): { nodes: NodeRecord[]; children: SubtreeChild[] } {
	const nodes: NodeRecord[] = boxes.map((b, i) => ({
		id: `n${i}`,
		x: b.x ?? 0,
		y: b.y ?? 0,
		width: b.width ?? 1,
		height: b.height ?? 1,
	}));
	const children = nodes.map((_n, i) => ({ base: i * 4, subtree: [i * 4] }));
	return { nodes, children };
}

const boxArb = fc.record({
	x: fc.integer({ min: -50, max: 50 }),
	y: fc.integer({ min: -50, max: 50 }),
	width: fc.integer({ min: 1, max: 20 }),
	height: fc.integer({ min: 1, max: 20 }),
});

const boxesArb = fc.array(boxArb, { minLength: 2, maxLength: 6 });

describe("property based primitives", () => {
	it("alignX left moves every node to the anchor's left edge", () => {
		fc.assert(
			fc.property(boxesArb, fc.nat(), (boxes, anchorSeed) => {
				const anchor = anchorSeed % boxes.length;
				const { nodes, children } = leafNodes(boxes);
				const op = alignX(children, "left", anchor);
				const result = solveLayout(
					{ nodes, operators: [op as LayoutOperator] },
					{ damping: 1 },
				);
				const line = boxes[anchor].x;
				return nodes.every((_n, i) => result[`n${i}`].x === line);
			}),
		);
	});

	it("alignX right aligns every right edge to the anchor's", () => {
		fc.assert(
			fc.property(boxesArb, (boxes) => {
				const { nodes, children } = leafNodes(boxes);
				const op = alignX(children, "right", 0);
				const result = solveLayout(
					{ nodes, operators: [op as LayoutOperator] },
					{ damping: 1 },
				);
				const line = boxes[0].x + boxes[0].width;
				return nodes.every(
					(_n, i) =>
						Math.abs(result[`n${i}`].x + result[`n${i}`].width - line) < 1e-9,
				);
			}),
		);
	});

	it("alignY centerY collapses every center onto the anchor's", () => {
		fc.assert(
			fc.property(boxesArb, (boxes) => {
				const { nodes, children } = leafNodes(boxes);
				const op = alignY(children, "centerY", 0);
				const result = solveLayout(
					{ nodes, operators: [op as LayoutOperator] },
					{ damping: 1 },
				);
				const line = boxes[0].y + boxes[0].height / 2;
				return nodes.every(
					(_n, i) =>
						Math.abs(result[`n${i}`].y + result[`n${i}`].height / 2 - line) <
						1e-9,
				);
			}),
		);
	});

	it("align never moves the anchor", () => {
		fc.assert(
			fc.property(boxesArb, fc.nat(), (boxes, anchorSeed) => {
				const anchor = anchorSeed % boxes.length;
				const { nodes, children } = leafNodes(boxes);
				const ops = [
					alignX(children, "centerX", anchor),
					alignY(children, "bottom", anchor),
				];
				const result = solveLayout(
					{ nodes, operators: ops as LayoutOperator[] },
					{ damping: 1 },
				);
				return (
					result[`n${anchor}`].x === boxes[anchor].x &&
					result[`n${anchor}`].y === boxes[anchor].y
				);
			}),
		);
	});

	it("distributeX with spacing yields exact gaps and keeps the anchor fixed", () => {
		fc.assert(
			fc.property(
				boxesArb,
				fc.integer({ min: 1, max: 30 }),
				fc.nat(),
				(boxes, spacing, anchorSeed) => {
					const anchor = anchorSeed % boxes.length;
					const { nodes, children } = leafNodes(boxes);
					const op = distributeX(children, { spacing, anchor });
					const result = solveLayout(
						{ nodes, operators: [op as LayoutOperator] },
						{ damping: 1 },
					);
					if (result[`n${anchor}`].x !== boxes[anchor].x) return false;
					for (let i = 0; i + 1 < boxes.length; i++) {
						const a = result[`n${i}`];
						const b = result[`n${i + 1}`];
						if (Math.abs(b.x - (a.x + a.width) - spacing) > 1e-9) return false;
					}
					return true;
				},
			),
		);
	});

	it("distributeY without spacing spreads evenly between the extremes", () => {
		fc.assert(
			fc.property(boxesArb, (boxes) => {
				const { nodes, children } = leafNodes(boxes);
				const op = distributeY(children);
				const result = solveLayout(
					{ nodes, operators: [op as LayoutOperator] },
					{ damping: 1 },
				);
				const ys = boxes.map((b) => b.y);
				const min = Math.min(...ys);
				const max = Math.max(...ys);
				const gap = (max - min) / (boxes.length - 1);
				return nodes.every(
					(_n, i) => Math.abs(result[`n${i}`].y - (min + i * gap)) < 1e-9,
				);
			}),
		);
	});

	it("stackV packs children with exact spacing and unions the container", () => {
		fc.assert(
			fc.property(
				boxesArb,
				fc.integer({ min: 0, max: 20 }),
				(boxes, spacing) => {
					const container: NodeRecord = {
						id: "c",
						x: 0,
						y: 0,
						width: 0,
						height: 0,
					};
					const { nodes, children } = leafNodes(boxes);
					const allNodes = [...nodes, container];
					const containerIdx = nodes.length * 4;
					const op = stackV(children, containerIdx, {
						spacing,
						alignment: "left",
					});
					const result = solveLayout(
						{ nodes: allNodes, operators: [op as LayoutOperator] },
						{ damping: 1 },
					);
					// packed with exact gaps
					for (let i = 0; i + 1 < boxes.length; i++) {
						const a = result[`n${i}`];
						const b = result[`n${i + 1}`];
						if (Math.abs(b.y - (a.y + a.height) - spacing) > 1e-9) return false;
					}
					// left alignment: all left edges equal
					const left = result.n0.x;
					if (!nodes.every((_n, i) => result[`n${i}`].x === left)) return false;
					// container is the union
					const totalH =
						boxes.reduce((s, b) => s + b.height, 0) +
						spacing * (boxes.length - 1);
					const maxW = Math.max(...boxes.map((b) => b.width));
					return (
						Math.abs(result.c.height - totalH) < 1e-9 &&
						Math.abs(result.c.width - maxW) < 1e-9
					);
				},
			),
		);
	});

	it("stackH anchored on an owned child never moves it", () => {
		fc.assert(
			fc.property(
				boxesArb,
				fc.integer({ min: 0, max: 20 }),
				fc.nat(),
				(boxes, spacing, anchorSeed) => {
					const anchor = anchorSeed % boxes.length;
					const container: NodeRecord = {
						id: "c",
						x: 0,
						y: 0,
						width: 0,
						height: 0,
					};
					const { nodes, children } = leafNodes(boxes);
					const allNodes = [...nodes, container];
					const containerIdx = nodes.length * 4;
					const op = stackH(children, containerIdx, {
						spacing,
						alignment: "top",
						mainAnchor: anchor,
						crossAnchor: anchor,
					});
					const result = solveLayout(
						{ nodes: allNodes, operators: [op as LayoutOperator] },
						{ damping: 1 },
					);
					return (
						result[`n${anchor}`].x === boxes[anchor].x &&
						result[`n${anchor}`].y === boxes[anchor].y
					);
				},
			),
		);
	});

	it("moving a child moves its whole subtree by the same delta", () => {
		fc.assert(
			fc.property(
				boxArb,
				boxArb,
				fc.integer({ min: 1, max: 30 }),
				(inner, outer, spacing) => {
					// nodes: 0 = leaf inside container, 1 = container, 2 = sibling, 3 = stack container
					const nodes: NodeRecord[] = [
						{ id: "leaf", x: inner.x, y: inner.y, width: 2, height: 2 },
						{
							id: "inner",
							x: inner.x,
							y: inner.y,
							width: inner.width,
							height: inner.height,
						},
						{
							id: "sib",
							x: outer.x,
							y: outer.y,
							width: outer.width,
							height: outer.height,
						},
						{ id: "stack", x: 0, y: 0, width: 0, height: 0 },
					];
					const children: SubtreeChild[] = [
						{ base: 8, subtree: [8] }, // sib
						{ base: 4, subtree: [4, 0] }, // inner + leaf
					];
					const op = stackV(children, 12, { spacing, alignment: "left" });
					const result = solveLayout(
						{ nodes, operators: [op as LayoutOperator] },
						{ damping: 1 },
					);
					// The leaf keeps its offset relative to its container
					const dx = result.leaf.x - result.inner.x;
					const dy = result.leaf.y - result.inner.y;
					return (
						Math.abs(dx - (nodes[0].x - nodes[1].x)) < 1e-9 &&
						Math.abs(dy - (nodes[0].y - nodes[1].y)) < 1e-9
					);
				},
			),
		);
	});

	it("backgroundOp expands the box around the child", () => {
		fc.assert(
			fc.property(boxArb, fc.integer({ min: 0, max: 20 }), (box, padding) => {
				const nodes: NodeRecord[] = [
					{
						id: "child",
						x: box.x,
						y: box.y,
						width: box.width,
						height: box.height,
					},
					{ id: "bg", x: 0, y: 0, width: 0, height: 0 },
				];
				const op = backgroundOp(0, 4, padding);
				const result = solveLayout(
					{ nodes, operators: [op as LayoutOperator] },
					{ damping: 1 },
				);
				return (
					result.bg.x === box.x - padding &&
					result.bg.y === box.y - padding &&
					result.bg.width === box.width + padding * 2 &&
					result.bg.height === box.height + padding * 2
				);
			}),
		);
	});

	it("unionOp is the exact union of the children", () => {
		fc.assert(
			fc.property(boxesArb, (boxes) => {
				const { nodes } = leafNodes(boxes);
				const container: NodeRecord = {
					id: "g",
					x: 0,
					y: 0,
					width: 0,
					height: 0,
				};
				const allNodes = [...nodes, container];
				const op = unionOp(
					nodes.map((_n, i) => i * 4),
					nodes.length * 4,
				);
				const result = solveLayout(
					{ nodes: allNodes, operators: [op as LayoutOperator] },
					{ damping: 1 },
				);
				const minX = Math.min(...boxes.map((b) => b.x));
				const minY = Math.min(...boxes.map((b) => b.y));
				const maxX = Math.max(...boxes.map((b) => b.x + b.width));
				const maxY = Math.max(...boxes.map((b) => b.y + b.height));
				return (
					result.g.x === minX &&
					result.g.y === minY &&
					Math.abs(result.g.width - (maxX - minX)) < 1e-9 &&
					Math.abs(result.g.height - (maxY - minY)) < 1e-9
				);
			}),
		);
	});
});
