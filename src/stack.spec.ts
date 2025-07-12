import { describe, expect, it } from "vitest";
import type { LayoutOperator, NodeRecord } from "./operators";
import { StackV } from "./operators";
import { solveLayout } from "./solver";

describe("Stack operator", () => {
	it("stacks children vertically with spacing and centers them", () => {
		const container: NodeRecord = {
			id: "container",
			x: 0,
			y: 0,
			width: 0,
			height: 0,
		};
		const child1: NodeRecord = { id: "A", x: 0, y: 0, width: 100, height: 50 };
		const child2: NodeRecord = { id: "B", x: 0, y: 0, width: 80, height: 30 };
		const child3: NodeRecord = { id: "C", x: 0, y: 0, width: 120, height: 20 };
		const nodes = [container, child1, child2, child3];
		const childIndices = nodes
			.slice(1)
			.map((n, i) => ({ base: (i + 1) * 4, node: n }));
		const op = new StackV(childIndices, 0, 5, "centerX");
		const scene = { nodes, operators: [op as LayoutOperator] };
		const result = solveLayout(scene, { damping: 1 });
		expect(result.A.y).toBe(0);
		expect(result.B.y).toBe(55);
		expect(result.C.y).toBe(90);
		expect(result.container.height).toBe(110);
		expect(result.container.width).toBe(120);
		expect(result.A.x).toBe(10);
	});
});
