import { describe, expect, it } from "vitest";
import type { LayoutOperator, NodeRecord } from "./operators";
import { AlignXLeft } from "./operators";
import { solveLayout } from "./solver";

describe("Align operator", () => {
	it("aligns multiple nodes to the leftmost X", () => {
		const nodes: NodeRecord[] = [
			{ id: "A", x: 30, y: 0, width: 10, height: 10 },
			{ id: "B", x: 10, y: 0, width: 10, height: 10 },
			{ id: "C", x: 20, y: 0, width: 10, height: 10 },
		];
		const op = new AlignXLeft(nodes.map((_n, i) => i * 4));
		const scene = { nodes, operators: [op as LayoutOperator] };
		const result = solveLayout(scene, { damping: 1 });
		expect(result.A.x).toBe(10);
		expect(result.B.x).toBe(10);
		expect(result.C.x).toBe(10);
	});
});
