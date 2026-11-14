import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildSceneFromJson, checkSolution } from "../parser.ts";
import type { LayoutOperator } from "./operators.ts";
import { foldPhases, lerpBoxes, phaseBoxes } from "./phases.ts";
import { type LayoutResult, solveLayout } from "./solver.ts";

type N = Record<string, unknown>;
const ref = (target: string): N => ({ type: "Ref", target });
const rect = (id: string, props: N = {}): N => ({
	type: "Rect",
	id,
	props: { width: 20, height: 10, ...props },
});
const rel = (type: string, id: string, ids: string[], props: N = {}): N => ({
	type,
	id,
	props,
	children: ids.map(ref),
});
const modulate = (id: string, children: N[], props: N = {}): N => ({
	type: "Modulate",
	id,
	props,
	children,
});
const resolve = (id: string, props: N = {}, ids: string[] = []): N => ({
	type: "Resolve",
	id,
	props,
	children: ids.map(ref),
});

const solve = (children: N[]) => {
	const scene = buildSceneFromJson({ type: "Group", id: "root", children });
	return { scene, layout: solveLayout(scene) };
};
/** Where a node is once `event` has played (home when it does not move it). */
const boxAfter = (layout: LayoutResult, id: string, event: string) => {
	const { x, y, width, height } = layout[id].phases?.[event] ?? layout[id];
	return { x, y, width, height };
};
const home = (layout: LayoutResult, id: string) => {
	const { x, y, width, height } = layout[id];
	return { x, y, width, height };
};
const near = (b: { x: number; y: number; width: number; height: number }) => ({
	x: expect.closeTo(b.x, 3),
	y: expect.closeTo(b.y, 3),
	width: expect.closeTo(b.width, 3),
	height: expect.closeTo(b.height, 3),
});

const list = (ids: string[]): N => ({
	type: "StackV",
	id: "list",
	props: { spacing: 8 },
	children: ids.map((id) => rect(id)),
});

describe("phases", () => {
	it("reorders a stack in place: the list keeps its box, the slots permute", () => {
		const { scene, layout } = solve([
			list(["a", "b", "c"]),
			modulate("shuffle", [
				rel("StackV", "order", ["c", "a", "b"], { spacing: 8 }),
			]),
		]);
		expect(scene.warnings).toEqual([]);
		expect(layout.list.phases).toBeUndefined();
		expect(boxAfter(layout, "c", "shuffle")).toEqual(near(home(layout, "a")));
		expect(boxAfter(layout, "a", "shuffle")).toEqual(near(home(layout, "b")));
		expect(boxAfter(layout, "b", "shuffle")).toEqual(near(home(layout, "c")));
		// home is still what the layout itself says
		expect(layout.a.y).toBeLessThan(layout.b.y);
	});

	it("makes room: the modulation closes the gap and Resolve returns exactly home", () => {
		const { layout } = solve([
			list(["a", "b", "c", "d"]),
			modulate(
				"without",
				[rel("StackV", "rest", ["a", "b", "d"], { spacing: 8 })],
				{
					at: 0,
					over: 0,
				},
			),
			resolve("part", { at: 1 }),
		]);
		expect(boxAfter(layout, "d", "without").y).toBeCloseTo(layout.c.y, 3);
		expect(layout.a.phases).toBeUndefined();
		// the list shrinks around what is left
		expect(boxAfter(layout, "list", "without").height).toBeCloseTo(
			layout.list.height - layout.d.height - 8,
			3,
		);
		expect(layout.d.phases?.part).toEqual(home(layout, "d"));
		expect(layout.list.phases?.part).toEqual(home(layout, "list"));
	});

	const handoff = (extra: N[] = []) =>
		solve([
			{
				type: "StackH",
				id: "row",
				props: { spacing: 30 },
				children: [rect("s1"), rect("s2"), rect("s3")],
			},
			rect("job", { width: 8, height: 4 }),
			rel("Align", "seat", ["s1", "job"], { alignment: "center" }),
			modulate("hop", [
				rel("Align", "seat3", ["s3", "job"], { alignment: "center" }),
			]),
			...extra,
		]);

	it("supersedes only the relation that placed a moved box; the row stays", () => {
		const { scene, layout } = handoff();
		expect(scene.warnings).toEqual([]);
		for (const id of ["s1", "s2", "s3", "row"])
			expect(layout[id].phases).toBeUndefined();
		const job = boxAfter(layout, "job", "hop");
		expect(job.x + job.width / 2).toBeCloseTo(layout.s3.x + 10, 3);
		expect(layout.job.x + 4).toBeCloseTo(layout.s1.x + 10, 3);
	});

	it("lets a later modulation win, and restores the earlier one when it resolves", () => {
		const { layout } = handoff([
			modulate(
				"hop2",
				[rel("Align", "seat2", ["s2", "job"], { alignment: "center" })],
				{ at: 1 },
			),
			resolve("back", { at: 2 }, ["hop2"]),
			resolve("done", { at: 3 }),
		]);
		const center = (event: string) => {
			const b = boxAfter(layout, "job", event);
			return b.x + b.width / 2;
		};
		expect(center("hop2")).toBeCloseTo(layout.s2.x + 10, 3);
		expect(layout.job.phases?.back).toEqual(layout.job.phases?.hop);
		expect(layout.job.phases?.done).toEqual(home(layout, "job"));
	});

	it("leaves members a superseded relation no longer places at home", () => {
		const { layout } = solve([
			list(["a", "b", "c"]),
			modulate("pair", [rel("StackV", "two", ["b", "a"], { spacing: 8 })]),
		]);
		expect(layout.c.phases).toBeUndefined();
		expect(boxAfter(layout, "b", "pair").y).toBeCloseTo(layout.a.y, 3);
	});

	it("resizes what a restated stack sized when the modulation gives another total", () => {
		const row = (total: number, id = "row"): N => ({
			type: "StackH",
			id,
			props: { spacing: 10, total },
			children: ["a", "b", "c"].map((r) => ({
				type: "Rect",
				id: r,
				props: { height: 10 },
			})),
		});
		const wide = solve([row(200)]).layout;
		const { scene, layout } = solve([
			row(100),
			modulate("m", [
				rel("StackH", "o", ["a", "b", "c"], { spacing: 10, total: 200 }),
			]),
		]);
		expect(scene.warnings).toEqual([]);
		expect(checkSolution(scene, layout)).toEqual([]);
		expect(wide.a.width).toBeGreaterThan(layout.a.width + 10);
		for (const id of ["a", "b", "c", "row"])
			expect(boxAfter(layout, id, "m").width).toBeCloseTo(wide[id].width, 3);
	});

	it("keeps the sizes of a restated stack when the modulation only reorders it", () => {
		const { scene, layout } = solve([
			{
				type: "StackH",
				id: "row",
				props: { spacing: 10, total: 100 },
				children: ["a", "b", "c"].map((r) => ({
					type: "Rect",
					id: r,
					props: { height: 10 },
				})),
			},
			modulate("m", [rel("StackH", "o", ["c", "a", "b"], { spacing: 10 })]),
		]);
		expect(scene.warnings).toEqual([]);
		expect(boxAfter(layout, "c", "m")).toEqual(near(home(layout, "a")));
		expect(layout.row.phases).toBeUndefined();
	});

	it("folds each clock's events in start order and cuts a step short at the next", () => {
		const { scene, layout } = solve([
			list(["a", "b"]),
			modulate("late", [rel("StackV", "x", ["b", "a"])], { at: 1, over: 1 }),
			modulate("early", [rel("StackV", "y", ["b", "a"])], { at: 0.8 }),
			resolve("out", { at: 1.5 }),
		]);
		const [{ clock, events }] = foldPhases(scene.nodes, (id) => {
			const b = layout[id];
			return b.start === undefined
				? undefined
				: { start: b.start, duration: b.duration ?? 0 };
		});
		expect(clock).toBeUndefined();
		expect(events).toEqual([
			{ id: "early", start: 0.8, over: 0.2, active: ["early"] },
			{ id: "late", start: 1, over: 0.5, active: ["early", "late"] },
			{ id: "out", start: 1.5, over: 0.5, active: [] },
		]);
	});

	it("reads a node's box after every event", () => {
		const box = { x: 0, y: 0, width: 1, height: 1 };
		const moved = { ...box, x: 5 };
		expect(
			phaseBoxes({ ...box, phases: { b: moved, d: box } }, [
				{ id: "a" },
				{ id: "b" },
				{ id: "c" },
				{ id: "d" },
			]).map((b) => b.x),
		).toEqual([0, 5, 5, 0]);
		expect(lerpBoxes(box, moved, 0.5).x).toBe(2.5);
	});
});

const sceneArb = fc.integer({ min: 3, max: 6 }).chain((n) =>
	fc.record({
		n: fc.constant(n),
		sizes: fc.array(fc.integer({ min: 4, max: 40 }), {
			minLength: n,
			maxLength: n,
		}),
		homeType: fc.constantFrom("StackV", "StackH"),
		modulations: fc.array(
			fc.record({
				type: fc.constantFrom("StackV", "StackH", "Align", "Distribute"),
				members: fc.uniqueArray(fc.integer({ min: 0, max: n - 1 }), {
					minLength: 2,
					maxLength: n,
				}),
				at: fc.integer({ min: 0, max: 6 }),
			}),
			{ minLength: 1, maxLength: 4 },
		),
		resolves: fc.array(fc.integer({ min: 0, max: 8 }), { maxLength: 2 }),
	}),
);
type S = typeof sceneArb extends fc.Arbitrary<infer T> ? T : never;
const json = (s: S, modulated = true): N => ({
	type: "Group",
	id: "root",
	children: [
		{
			type: s.homeType,
			id: "home",
			children: s.sizes.map((size, i) =>
				rect(`r${i}`, { width: size, height: 44 - size }),
			),
		},
		...(modulated
			? [
					...s.modulations.map((m, j) =>
						modulate(
							`m${j}`,
							[
								rel(
									m.type,
									`rel${j}`,
									m.members.map((i) => `r${i}`),
									{ spacing: 5 },
								),
							],
							{ at: m.at / 2 },
						),
					),
					...s.resolves.map((at, j) => resolve(`back${j}`, { at: at / 2 })),
				]
			: []),
	],
});

describe("phases (properties)", () => {
	it("is home with nothing active, and depends only on what is active", () => {
		fc.assert(
			fc.property(sceneArb, (s) => {
				const scene = buildSceneFromJson(json(s));
				const layout = solveLayout(scene);
				const plain = solveLayout(buildSceneFromJson(json(s, false)));
				for (const id of Object.keys(plain))
					expect(home(layout, id)).toEqual(home(plain, id));
				const span = (id: string) => ({
					start: layout[id].start ?? 0,
					duration: layout[id].duration ?? 0,
				});
				const [{ events }] = foldPhases(scene.nodes, span);
				const seen = new Map<string, string>();
				const ids = s.sizes.map((_, i) => `r${i}`);
				const boxes = ids.map((id) =>
					phaseBoxes(layout[id], events).map(({ x, y, width, height }) => ({
						x,
						y,
						width,
						height,
					})),
				);
				events.forEach((e, k) => {
					const state = JSON.stringify(boxes.map((b) => b[k]));
					if (e.active.length === 0)
						expect(state).toBe(
							JSON.stringify(ids.map((id) => home(layout, id))),
						);
					const key = e.active.join();
					// the same modulations give the same layout, however they came about
					const known = seen.get(key);
					if (known !== undefined)
						expect(JSON.parse(state)).toEqual(
							JSON.parse(known).map((b: Record<string, number>) =>
								Object.fromEntries(
									Object.entries(b).map(([c, v]) => [c, expect.closeTo(v, 2)]),
								),
							),
						);
					else seen.set(key, state);
				});
			}),
			{ numRuns: 200 },
		);
	});

	it("declared writes solve the phases exactly as the full scan does", () => {
		const withoutWrites = (ops: LayoutOperator[]): LayoutOperator[] =>
			ops.map((op) => (cur, next) => op(cur, next));
		fc.assert(
			fc.property(sceneArb, (s) => {
				const scene = buildSceneFromJson(json(s));
				const slow = {
					...scene,
					operators: withoutWrites(scene.operators),
					phaseOperators: (active: readonly string[]) => {
						const phase = scene.phaseOperators?.(active);
						return {
							operators: withoutWrites(phase?.operators ?? []),
							names: phase?.names ?? [],
						};
					},
				};
				expect(solveLayout(scene)).toEqual(solveLayout(slow));
			}),
			{ numRuns: 200 },
		);
	});
});
