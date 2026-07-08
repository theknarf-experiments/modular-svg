import { describe, expect, it } from "vitest";
import { solveLayout } from "./index.ts";
import type { LayoutOperator, NodeRecord } from "./operators.ts";
import { alignX } from "./operators.ts";

describe("Align operator", () => {
	it("aligns every node to the anchor's left edge", () => {
		const nodes: NodeRecord[] = [
			{ id: "A", x: 30, y: 0, width: 10, height: 10 },
			{ id: "B", x: 10, y: 0, width: 10, height: 10 },
			{ id: "C", x: 20, y: 0, width: 10, height: 10 },
		];
		const children = nodes.map((_n, i) => ({
			base: i * 4,
			subtree: [i * 4],
		}));
		const op = alignX(children, "left", 0);
		const scene = { nodes, operators: [op as LayoutOperator] };
		const result = solveLayout(scene, { damping: 1 });
		expect(result.A.x).toBe(30);
		expect(result.B.x).toBe(30);
		expect(result.C.x).toBe(30);
	});
});
