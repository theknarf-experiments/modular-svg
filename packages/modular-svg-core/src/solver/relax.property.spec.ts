import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildSceneFromJson, checkSolution } from "../parser.ts";
import type { LayoutOperator } from "./operators.ts";
import { solveLayout } from "./solver.ts";

const ref = (target: string, paint?: string) => ({
	type: "Ref",
	target,
	...(paint ? { paint } : {}),
});

const sceneArb = fc.integer({ min: 2, max: 7 }).chain((n) =>
	fc.record({
		n: fc.constant(n),
		sizes: fc.array(fc.integer({ min: 1, max: 40 }), {
			minLength: n,
			maxLength: n,
		}),
		pins: fc.array(
			fc.option(fc.integer({ min: -30, max: 30 }), { nil: undefined, freq: 3 }),
			{ minLength: n, maxLength: n },
		),
		relations: fc.array(
			fc.record({
				type: fc.constantFrom(
					"StackH",
					"StackV",
					"Align",
					"Distribute",
					"Arrow",
					"SameColor",
					"Darken",
					"DistinctColors",
					"Sequence",
					"Stagger",
					"Before",
					"Legato",
				),
				members: fc.uniqueArray(fc.integer({ min: 0, max: n - 1 }), {
					minLength: 2,
					maxLength: Math.min(4, n),
				}),
			}),
			{ minLength: 1, maxLength: 6 },
		),
	}),
);

type S = {
	n: number;
	sizes: number[];
	pins: (number | undefined)[];
	relations: { type: string; members: number[] }[];
};

function json(s: S) {
	const children: unknown[] = [];
	for (let i = 0; i < s.n; i++) {
		const pin = s.pins[i];
		children.push({
			type: "Rect",
			id: `r${i}`,
			props: {
				width: s.sizes[i],
				height: 10,
				...(pin !== undefined ? { x: pin, fill: "#3366cc" } : {}),
			},
		});
		children.push({
			type: "Enter",
			id: `m${i}`,
			props: { over: s.sizes[i] / 40 },
			children: [ref(`r${i}`)],
		});
	}
	s.relations.forEach((r, j) => {
		const time = ["Sequence", "Stagger", "Before", "Legato"].includes(r.type);
		const members = r.members.map((i) => (time ? ref(`m${i}`) : ref(`r${i}`)));
		if (r.type === "Darken") members[1] = ref(`r${r.members[1]}`, "stroke");
		children.push({
			type: r.type,
			id: `rel${j}`,
			props: { spacing: 7, gap: 0.1 },
			children: members,
		});
	});
	return { type: "Group", id: "root", children };
}

// The same operators without their declared writes: the solver's full scan
const withoutWrites = (ops: LayoutOperator[]): LayoutOperator[] =>
	ops.map((op) => (cur, next) => op(cur, next));

describe("declared writes (properties)", () => {
	it("solve and check exactly as the full scan does", () => {
		fc.assert(
			fc.property(sceneArb, (s) => {
				const scene = buildSceneFromJson(json(s));
				const slow = {
					...scene,
					operators: withoutWrites(scene.operators),
					colorOperators: withoutWrites(scene.colorOperators),
					timeOperators: withoutWrites(scene.timeOperators),
				};
				const fast = solveLayout(scene);
				const full = solveLayout(slow);
				expect(fast).toEqual(full);
				expect(checkSolution(scene, fast)).toEqual(checkSolution(slow, full));
			}),
			{ numRuns: 300 },
		);
	});
});
