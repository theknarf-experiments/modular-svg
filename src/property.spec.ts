import fc from "fast-check";
import { describe, it } from "vitest";
import type { LayoutOperator, NodeRecord } from "./operators";
import { AlignXLeft, DistributeX } from "./operators";
import { solveLayout } from "./solver";

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
					const op = new AlignXLeft(nodes.map((_n, i) => i * 4));
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
					const op = new DistributeX(nodes.map((_n, i) => i * 4));
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
});
