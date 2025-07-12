import { describe, expect, it } from "vitest";
import type { LayoutOperator, NodeRecord } from "./operators";
import { DistributeX } from "./operators";
import { solveLayout } from "./solver";

describe("Distribute operator", () => {
	it("distributes points evenly", () => {
		const nodes: NodeRecord[] = [
			{ id: "A", x: 0, y: 0, width: 0, height: 0 },
			{ id: "B", x: 10, y: 0, width: 0, height: 0 },
			{ id: "C", x: 30, y: 0, width: 0, height: 0 },
		];
		const op = new DistributeX(nodes.map((_, i) => i * 4));
		const scene = { nodes, operators: [op as LayoutOperator] };
		const result = solveLayout(scene, { damping: 1 });
		expect(result.B.x).toBeCloseTo(15);
	});
});
