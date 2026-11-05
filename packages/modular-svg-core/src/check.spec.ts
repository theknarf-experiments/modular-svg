import { describe, expect, it } from "vitest";
import { buildSceneFromJson, checkLayout, checkSolution } from "./parser.ts";
import { solveLayout } from "./solver/index.ts";

const rect = (id: string, props: Record<string, unknown> = {}) => ({
	type: "Rect",
	id,
	props: { width: 20, height: 20, ...props },
});
const ref = (target: string) => ({ type: "Ref", target });

describe("post-solve checks", () => {
	it("passes a satisfiable layout", () => {
		const scene = buildSceneFromJson({
			type: "StackH",
			id: "row",
			children: [rect("a"), rect("b")],
		});
		expect(checkSolution(scene, solveLayout(scene))).toEqual([]);
	});

	it("names layout relations the solution does not satisfy", () => {
		// both rects are pinned, so the stack cannot place them 10 apart
		const scene = buildSceneFromJson({
			type: "Group",
			children: [
				rect("a", { x: 0, y: 0 }),
				rect("b", { x: 200, y: 0 }),
				{
					type: "Distribute",
					id: "d",
					props: { spacing: 10 },
					children: [ref("a"), ref("b")],
				},
				{
					type: "Distribute",
					id: "e",
					props: { spacing: 50 },
					children: [ref("a"), ref("b")],
				},
			],
		});
		expect(checkLayout(scene, solveLayout(scene))[0]).toMatch(
			/distribute\(a, b\).*did not settle|distribute\(a, b\) does not hold/,
		);
	});
});
