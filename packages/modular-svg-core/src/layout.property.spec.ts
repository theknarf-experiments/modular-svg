import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { layoutToSvg } from "./output.ts";
import { buildSceneFromJson, checkSolution } from "./parser.ts";
import { solveLayout } from "./solver/index.ts";

type Box = { x: number; y: number; width: number; height: number };

const ALIGNMENTS = [
	"left",
	"centerX",
	"right",
	"top",
	"centerY",
	"bottom",
	"center",
] as const;

const relationArb = (n: number) =>
	fc.record({
		type: fc.constantFrom("Align", "Distribute", "StackH", "StackV"),
		members: fc.uniqueArray(fc.integer({ min: 0, max: n - 1 }), {
			minLength: 2,
			maxLength: Math.min(4, n),
		}),
		alignment: fc.constantFrom(...ALIGNMENTS),
		axis: fc.constantFrom("x" as const, "y" as const),
		spacing: fc.constantFrom(0, 5, 20),
	});

const sceneArb = fc.integer({ min: 2, max: 6 }).chain((n) =>
	fc.record({
		rects: fc.array(
			fc.record({
				width: fc.integer({ min: 1, max: 60 }),
				height: fc.integer({ min: 1, max: 60 }),
				pin: fc.option(
					fc.record({
						x: fc.integer({ min: -50, max: 50 }),
						y: fc.integer({ min: -50, max: 50 }),
					}),
					{ nil: undefined, freq: 3 },
				),
			}),
			{ minLength: n, maxLength: n },
		),
		relations: fc.array(relationArb(n), { minLength: 1, maxLength: 4 }),
	}),
);

type Scene = {
	rects: { width: number; height: number; pin?: { x: number; y: number } }[];
	relations: {
		type: string;
		members: number[];
		alignment: (typeof ALIGNMENTS)[number];
		axis: "x" | "y";
		spacing: number;
	}[];
};

function json(s: Scene) {
	const ref = (i: number) => ({ type: "Ref", target: `r${i}` });
	return {
		type: "Group",
		id: "root",
		children: [
			...s.rects.map((r, i) => ({
				type: "Rect",
				id: `r${i}`,
				props: { width: r.width, height: r.height, ...(r.pin ?? {}) },
			})),
			...s.relations.map((r, j) => ({
				type: r.type,
				id: `rel${j}`,
				props:
					r.type === "Align"
						? { alignment: r.alignment }
						: r.type === "Distribute"
							? { axis: r.axis, spacing: r.spacing }
							: { spacing: r.spacing },
				children: r.members.map(ref),
			})),
		],
	};
}

// Where an alignment keyword puts its line, per axis
const lines: Record<string, Partial<Record<"x" | "y", (b: Box) => number>>> = {
	left: { x: (b) => b.x },
	centerX: { x: (b) => b.x + b.width / 2 },
	right: { x: (b) => b.x + b.width },
	top: { y: (b) => b.y },
	centerY: { y: (b) => b.y + b.height / 2 },
	bottom: { y: (b) => b.y + b.height },
	center: { x: (b) => b.x + b.width / 2, y: (b) => b.y + b.height / 2 },
};

describe("layout relations (properties)", () => {
	it("a solution without warnings satisfies every relation", () => {
		fc.assert(
			fc.property(sceneArb, (s) => {
				const scene = buildSceneFromJson(json(s));
				const layout = solveLayout(scene);
				if (
					scene.warnings.length > 0 ||
					checkSolution(scene, layout).length > 0
				)
					return;
				const box = (i: number): Box => layout[`r${i}`];
				const close = (a: number, b: number) =>
					expect(Math.abs(a - b)).toBeLessThan(0.05);
				for (const r of s.relations) {
					const m = r.members;
					if (r.type === "Align") {
						for (const f of Object.values(lines[r.alignment]))
							for (const i of m) close(f(box(i)), f(box(m[0])));
					}
					const packed =
						r.type === "Distribute"
							? r.axis
							: r.type === "StackH"
								? "x"
								: r.type === "StackV"
									? "y"
									: undefined;
					if (packed) {
						const extent = packed === "x" ? "width" : "height";
						for (let j = 1; j < m.length; j++) {
							const [a, b] = [box(m[j - 1]), box(m[j])];
							close(b[packed], a[packed] + a[extent] + r.spacing);
						}
					}
					// stacks also center their members across the axis
					if (r.type === "StackH")
						for (const i of m)
							close(
								lines.centerY.y?.(box(i)) ?? 0,
								lines.centerY.y?.(box(m[0])) ?? 0,
							);
					if (r.type === "StackV")
						for (const i of m)
							close(
								lines.centerX.x?.(box(i)) ?? 0,
								lines.centerX.x?.(box(m[0])) ?? 0,
							);
				}
				// Explicit x/y is soft ownership: a relation may move a pinned rect
				// (only relation-vs-relation conflicts warn). Untouched pins stay.
				const related = new Set(s.relations.flatMap((r) => r.members));
				s.rects.forEach((r, i) => {
					if (!r.pin || related.has(i)) return;
					close(box(i).x, r.pin.x);
					close(box(i).y, r.pin.y);
				});
			}),
			{ numRuns: 500 },
		);
	});
});

// Some of the relations move into Modulates, in scene time or in a phrase
const modulatedArb = sceneArb.chain((s) =>
	fc.record({
		scene: fc.constant(s),
		when: fc.array(
			fc.option(
				fc.record({
					at: fc.constantFrom(0, 0.5, 1, 2),
					over: fc.constantFrom(0, 0.25, 1),
					phrase: fc.boolean(),
				}),
				{ nil: undefined },
			),
			{ minLength: s.relations.length, maxLength: s.relations.length },
		),
		resolve: fc.option(fc.constantFrom(0.75, 1.5, 3), { nil: undefined }),
	}),
);

describe("layout in time (properties)", () => {
	it("never throws, stays finite, and leaves home as it was", () => {
		fc.assert(
			fc.property(modulatedArb, ({ scene: s, when, resolve }) => {
				const base = json(s);
				const home = {
					...base,
					children: base.children.filter(
						(_, i) => i < s.rects.length || !when[i - s.rects.length],
					),
				};
				const timed = (i: number) => when[i - s.rects.length];
				const modulate = (i: number) => ({
					type: "Modulate",
					id: `m${i}`,
					props: { at: timed(i)?.at, over: timed(i)?.over },
					children: [base.children[i]],
				});
				const indices = base.children.map((_, i) => i);
				const moving = indices.filter((i) => i >= s.rects.length && timed(i));
				const modulated = {
					...home,
					children: [
						...home.children,
						...moving.filter((i) => !timed(i)?.phrase).map(modulate),
						{
							type: "Phrase",
							id: "phrase",
							props: { repeat: 2, alternate: true },
							children: moving.filter((i) => timed(i)?.phrase).map(modulate),
						},
						...(resolve !== undefined
							? [{ type: "Resolve", id: "resolve", props: { at: resolve } }]
							: []),
					],
				};
				const scene = buildSceneFromJson(modulated);
				const layout = solveLayout(scene);
				checkSolution(scene, layout);
				for (const box of Object.values(layout))
					for (const phase of Object.values(box.phases ?? {}))
						for (const v of Object.values(phase))
							expect(Number.isFinite(v)).toBe(true);
				expect(layoutToSvg(layout, scene.nodes)).not.toMatch(/NaN|Infinity/);
				// Home is the layout without the modulations, to the solver's precision
				const plain = solveLayout(buildSceneFromJson(home));
				s.rects.forEach((_, i) => {
					for (const side of ["x", "y", "width", "height"] as const)
						expect(layout[`r${i}`][side]).toBeCloseTo(plain[`r${i}`][side], 3);
				});
			}),
			{ numRuns: 300 },
		);
	});
});
