import { describe, expect, it } from "vitest";
import { solveLayout } from "./index.ts";
import type { LayoutOperator, NodeRecord } from "./operators.ts";
import { distributeX } from "./operators.ts";

describe("Distribute operator", () => {
	it("distributes points evenly", () => {
		const nodes: NodeRecord[] = [
			{ id: "A", x: 0, y: 0, width: 0, height: 0 },
			{ id: "B", x: 10, y: 0, width: 0, height: 0 },
			{ id: "C", x: 30, y: 0, width: 0, height: 0 },
		];
		const children = nodes.map((_n, i) => ({ base: i * 4, subtree: [i * 4] }));
		const op = distributeX(children, 0, 0);
		const scene = { nodes, operators: [op as LayoutOperator] };
		const result = solveLayout(scene, { damping: 1 });
		expect(result.B.x).toBeCloseTo(15);
	});
});
