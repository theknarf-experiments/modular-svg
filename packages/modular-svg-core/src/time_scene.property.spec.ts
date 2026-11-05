import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildSceneFromJson, checkSolution } from "./parser.ts";
import { solveLayout } from "./solver/index.ts";
import { snapToGrid } from "./solver/time.ts";
import { layoutToAst } from "./svg_ast.ts";

type N = {
	type: string;
	id?: string;
	props?: Record<string, unknown>;
	children?: N[];
	target?: string;
};
const ref = (target: string): N => ({ type: "Ref", target });

const RELATIONS = [
	"Sequence",
	"SameTime",
	"Stagger",
	"Before",
	"After",
	"During",
	"OnBeat",
	"Legato",
] as const;
type Relation = {
	type: (typeof RELATIONS)[number];
	members: number[];
	gap: number;
	spacing: number;
	align: "start" | "end";
	division: number;
};

const relationArb = (n: number) =>
	fc.record({
		type: fc.constantFrom(...RELATIONS),
		members: fc.uniqueArray(fc.integer({ min: 0, max: n - 1 }), {
			minLength: 2,
			maxLength: Math.min(4, n),
		}),
		gap: fc.constantFrom(0, 0.1, 0.25),
		spacing: fc.constantFrom(0.1, 0.3),
		align: fc.constantFrom("start" as const, "end" as const),
		division: fc.constantFrom(1, 2, 3),
	});

type TimeScene = {
	n: number;
	overs: number[];
	pins: (number | undefined)[];
	bpm: number;
	relations: Relation[];
};

const timeSceneArb: fc.Arbitrary<TimeScene> = fc
	.integer({ min: 2, max: 6 })
	.chain((n) =>
		fc.record({
			n: fc.constant(n),
			overs: fc.array(fc.constantFrom(0.2, 0.5, 1, 1.5), {
				minLength: n,
				maxLength: n,
			}),
			pins: fc.array(
				fc.option(fc.constantFrom(0, 0.5, 2), { nil: undefined, freq: 4 }),
				{ minLength: n, maxLength: n },
			),
			bpm: fc.constantFrom(60, 90, 120),
			relations: fc.array(relationArb(n), { minLength: 1, maxLength: 4 }),
		}),
	);

/** The scene as JSON, with every length and time scaled by k (bpm by 1/k). */
function sceneJson(s: TimeScene, k = 1): N {
	const children: N[] = [
		{ type: "Beat", id: "beat", props: { bpm: s.bpm / k, offset: 0 } },
	];
	for (let i = 0; i < s.n; i++) {
		children.push({
			type: "Rect",
			id: `r${i}`,
			props: { width: 10, height: 10 },
		});
		const pin = s.pins[i];
		children.push({
			type: "Enter",
			id: `m${i}`,
			props: {
				over: s.overs[i] * k,
				...(pin !== undefined ? { at: pin * k } : {}),
			},
			children: [ref(`r${i}`)],
		});
	}
	s.relations.forEach((r, j) => {
		const members = r.members.map((i) => ref(`m${i}`));
		children.push({
			type: r.type,
			id: `rel${j}`,
			props: {
				gap: r.gap * k,
				spacing: r.spacing * k,
				align: r.align,
				division: r.division,
			},
			children: r.type === "OnBeat" ? [ref("beat"), ...members] : members,
		});
	});
	return { type: "Group", id: "root", children };
}

function solve(s: TimeScene, k = 1) {
	const scene = buildSceneFromJson(sceneJson(s, k) as Record<string, unknown>);
	const layout = solveLayout(scene);
	const warnings = [...scene.warnings, ...checkSolution(scene, layout)];
	const start = (i: number) => layout[`m${i}`].start ?? 0;
	const length = (i: number) => layout[`m${i}`].duration ?? 0;
	return {
		scene,
		layout,
		warnings,
		start,
		length,
		end: (i: number) => start(i) + length(i),
	};
}

const EPS = 1e-3;

describe("time relations (properties)", () => {
	it("a solution without warnings satisfies every relation", () => {
		fc.assert(
			fc.property(timeSceneArb, (s) => {
				const { warnings, start, length, end, layout } = solve(s);
				if (warnings.length > 0) return;
				for (const r of s.relations) {
					const m = r.members;
					for (let j = 1; j < m.length; j++) {
						const [a, b] = [m[j - 1], m[j]];
						if (r.type === "Sequence")
							expect(start(b)).toBeCloseTo(end(a) + r.gap, 3);
						if (r.type === "SameTime") {
							const at = (i: number) => (r.align === "end" ? end(i) : start(i));
							expect(at(b)).toBeCloseTo(at(m[0]), 3);
						}
						if (r.type === "Stagger")
							expect(start(b) - start(a)).toBeCloseTo(r.spacing, 3);
						if (r.type === "Before")
							expect(start(b)).toBeGreaterThanOrEqual(end(a) + r.gap - EPS);
						if (r.type === "Legato")
							expect(length(a)).toBeCloseTo(start(b) - start(a), 3);
					}
					if (r.type === "After")
						for (const leader of m.slice(1))
							expect(start(m[0])).toBeGreaterThanOrEqual(
								end(leader) + r.gap - EPS,
							);
					if (r.type === "During")
						for (const inner of m.slice(1)) {
							expect(start(inner)).toBeGreaterThanOrEqual(start(m[0]) - EPS);
							expect(end(inner)).toBeLessThanOrEqual(end(m[0]) + EPS);
						}
					if (r.type === "OnBeat") {
						const beat = layout.beat;
						const grid = {
							every: 1,
							division: r.division,
							offset: 0,
							swing: 0.5,
						};
						for (const i of m) {
							const at = r.align === "end" ? end(i) : start(i);
							const snapped = snapToGrid(
								at,
								beat.start ?? 0,
								beat.duration ?? 0,
								grid,
								"nearest",
							);
							expect(Math.abs(snapped - at)).toBeLessThan(EPS);
						}
					}
				}
				// nothing starts before the scene
				for (let i = 0; i < s.n; i++) expect(start(i)).toBeGreaterThan(-EPS);
			}),
			{ numRuns: 500 },
		);
	});

	it("solving is deterministic", () => {
		fc.assert(
			fc.property(timeSceneArb, (s) => {
				expect(solve(s).layout).toEqual(solve(s).layout);
			}),
			{ numRuns: 100 },
		);
	});

	it("scaling every length and time by k scales the schedule by k", () => {
		fc.assert(
			fc.property(timeSceneArb, fc.constantFrom(0.5, 2, 3), (s, k) => {
				const a = solve(s);
				const b = solve(s, k);
				if (a.warnings.length > 0 || b.warnings.length > 0) return;
				for (let i = 0; i < s.n; i++) {
					expect(b.start(i)).toBeCloseTo(a.start(i) * k, 2);
					expect(b.length(i)).toBeCloseTo(a.length(i) * k, 2);
				}
			}),
			{ numRuns: 200 },
		);
	});

	it("compiles to finite CSS whose keyframes run 0% to 100% in order", () => {
		fc.assert(
			fc.property(timeSceneArb, fc.boolean(), (s, loop) => {
				const { scene, layout, warnings } = solve(s);
				if (warnings.length > 0) return;
				const css =
					layoutToAst(layout, scene.nodes, 0, { animation: { loop } }).css ??
					"";
				expect(css).not.toMatch(/NaN|Infinity|undefined/);
				for (const [, body] of css.matchAll(/@keyframes [^{]+\{(.*?)\}\n/g)) {
					const at = [...body.matchAll(/([\d.]+)%\{/g)].map((x) =>
						Number(x[1]),
					);
					expect(at[0]).toBe(0);
					expect(at.at(-1)).toBe(100);
					for (let i = 1; i < at.length; i++)
						expect(at[i]).toBeGreaterThan(at[i - 1]);
				}
			}),
			{ numRuns: 300 },
		);
	});
});
