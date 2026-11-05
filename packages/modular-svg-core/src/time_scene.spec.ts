import { describe, expect, it } from "vitest";
import { buildSceneFromJson } from "./parser.ts";
import { solveLayout } from "./solver/index.ts";
import { checkTime } from "./time_scene.ts";

type N = {
	type: string;
	id?: string;
	props?: Record<string, unknown>;
	children?: N[];
	target?: string;
};
const ref = (target: string): N => ({ type: "Ref", target });
const dot = (id: string): N => ({ type: "Circle", id, props: { r: 5 } });
const motion = (
	type: string,
	id: string,
	target: string,
	props: Record<string, unknown> = {},
): N => ({
	type,
	id,
	props,
	children: [ref(target)],
});

const solve = (children: N[]) => {
	const scene = buildSceneFromJson({ type: "Group", id: "root", children });
	const layout = solveLayout(scene);
	const span = (id: string) => [layout[id].start, layout[id].duration];
	return {
		scene,
		layout,
		span,
		warnings: [...scene.warnings, ...checkTime(scene, layout)],
	};
};

describe("time relations over refs", () => {
	it("sequences motions declared earlier", () => {
		const { span, warnings } = solve([
			{ type: "StackH", children: [dot("a"), dot("b")] },
			motion("Enter", "aIn", "a", { over: 1 }),
			motion("Enter", "bIn", "b", { over: 0.5 }),
			{
				type: "Sequence",
				props: { gap: 0.25 },
				children: [ref("aIn"), ref("bIn")],
			},
		]);
		expect(span("aIn")).toEqual([0, 1]);
		expect(span("bIn")).toEqual([1.25, 0.5]);
		expect(warnings).toEqual([]);
	});

	it("lets a mark stand for its motions: relating marks moves what animates them", () => {
		const { span } = solve([
			dot("a"),
			dot("b"),
			motion("Enter", "aIn", "a", { over: 1 }),
			motion("Draw", "bDraw", "b", { over: 0.5 }),
			motion("Shake", "bShake", "b", { over: 0.5 }),
			{ type: "SameTime", children: [ref("bDraw"), ref("bShake")] },
			{ type: "Sequence", children: [ref("a"), ref("b")] },
		]);
		expect(span("b")).toEqual([1, 0.5]);
		expect(span("bShake")).toEqual([1, 0.5]);
		// the mark's span is the union of its motions
		expect(span("a")).toEqual([0, 1]);
	});

	it("nests: a sequence is itself a span other relations can ref", () => {
		const { span } = solve([
			dot("a"),
			dot("b"),
			dot("c"),
			motion("Enter", "aIn", "a", { over: 1 }),
			motion("Enter", "bIn", "b", { over: 1 }),
			motion("Enter", "cIn", "c", { over: 1 }),
			{ type: "Sequence", id: "intro", children: [ref("aIn"), ref("bIn")] },
			{
				type: "Sequence",
				props: { gap: 0.5 },
				children: [ref("intro"), ref("cIn")],
			},
		]);
		expect(span("intro")).toEqual([0, 2]);
		expect(span("cIn")[0]).toBe(2.5);
	});

	it("anchors on a pinned member, even inside a group", () => {
		const { span, warnings } = solve([
			dot("a"),
			dot("b"),
			dot("c"),
			motion("Enter", "aIn", "a", { over: 1 }),
			motion("Enter", "bIn", "b", { over: 1, at: 3 }),
			motion("Enter", "cIn", "c", { over: 1 }),
			{ type: "SameTime", id: "pair", children: [ref("bIn"), ref("cIn")] },
			{ type: "Sequence", children: [ref("aIn"), ref("pair")] },
		]);
		expect(span("bIn")[0]).toBe(3);
		expect(span("cIn")[0]).toBe(3);
		expect(span("aIn")[0]).toBe(2);
		expect(warnings).toEqual([]);
	});

	it("joins with After and snaps onto beats", () => {
		const { span, warnings } = solve([
			dot("a"),
			dot("b"),
			dot("c"),
			{ type: "Beat", id: "beat", props: { bpm: 120 } },
			motion("Enter", "aIn", "a", { over: 0.3 }),
			motion("Enter", "bIn", "b", { over: 0.7 }),
			motion("Enter", "cIn", "c", { over: 0.5 }),
			{ type: "After", children: [ref("cIn"), ref("aIn"), ref("bIn")] },
			{ type: "OnBeat", children: [ref("beat"), ref("cIn")] },
		]);
		expect(span("cIn")[0]).toBe(1);
		expect(warnings).toEqual([]);
	});

	it("stretches a looping motion to a beat", () => {
		const { span } = solve([
			dot("a"),
			{ type: "Beat", id: "beat", props: { bpm: 90 } },
			motion("Wiggle", "w", "a", { seed: "x" }),
			{ type: "Stretch", children: [ref("beat"), ref("w")] },
		]);
		expect(span("w")[1]).toBeCloseTo(60 / 90, 6);
	});

	it("staggers a whole row by its marks", () => {
		const { span } = solve([
			{ type: "StackH", id: "row", children: [dot("a"), dot("b"), dot("c")] },
			motion("Enter", "aIn", "a"),
			motion("Enter", "bIn", "b"),
			motion("Enter", "cIn", "c"),
			{
				type: "Stagger",
				props: { spacing: 0.1 },
				children: [ref("a"), ref("b"), ref("c")],
			},
		]);
		expect([span("aIn")[0], span("bIn")[0], span("cIn")[0]]).toEqual([
			0, 0.1, 0.2,
		]);
		// a layout container spans its marks' motions
		expect(span("row")).toEqual([0, 0.7]);
	});

	it("warns on over-constraint and unsatisfiable inequalities", () => {
		const twice = solve([
			dot("a"),
			dot("b"),
			dot("c"),
			motion("Enter", "aIn", "a"),
			motion("Enter", "bIn", "b"),
			motion("Enter", "cIn", "c"),
			{ type: "Sequence", children: [ref("aIn"), ref("bIn")] },
			{
				type: "Sequence",
				props: { gap: 1 },
				children: [ref("aIn"), ref("cIn")],
			},
			{ type: "SameTime", children: [ref("bIn"), ref("cIn")] },
		]);
		expect(twice.warnings.join()).toMatch(
			/conflicts with another relation over cIn:start/,
		);

		const twoPins = solve([
			dot("a"),
			dot("b"),
			motion("Enter", "aIn", "a", { at: 0 }),
			motion("Enter", "bIn", "b", { at: 5 }),
			{ type: "Sequence", children: [ref("aIn"), ref("bIn")] },
		]);
		expect(twoPins.warnings.join()).toMatch(/moves bIn, whose start is pinned/);

		const pinned = solve([
			dot("a"),
			dot("b"),
			motion("Enter", "aIn", "a", { at: 1, over: 1 }),
			motion("Enter", "bIn", "b", { at: 0.5 }),
			{ type: "Before", children: [ref("aIn"), ref("bIn")] },
		]);
		expect(pinned.warnings.join()).toMatch(/bIn starts before aIn ends/);
	});

	it("lands pickups on the beat and fits offbeats between", () => {
		const { span, warnings } = solve([
			dot("a"),
			dot("b"),
			{ type: "Beat", id: "beat", props: { bpm: 60 } },
			motion("Draw", "arrow", "a", { over: 0.3 }),
			motion("Enter", "hat", "b", { over: 0.2 }),
			{
				type: "OnBeat",
				props: { align: "end" },
				children: [ref("beat"), ref("arrow")],
			},
			{
				type: "OnBeat",
				props: { offset: 0.5 },
				children: [ref("beat"), ref("hat")],
			},
		]);
		// the draw ends on beat 1, the hat sits on the "and" of beat 0
		expect(span("arrow")).toEqual([0.7, 0.3]);
		expect(span("hat")[0]).toBe(0.5);
		expect(warnings).toEqual([]);
	});

	it("holds captions legato and lengths in beats", () => {
		const { span, warnings } = solve([
			dot("c1"),
			dot("c2"),
			dot("c3"),
			{ type: "Beat", id: "beat", props: { bpm: 120 } },
			motion("Enter", "one", "c1"),
			motion("Enter", "two", "c2"),
			motion("Enter", "three", "c3"),
			{
				type: "Stagger",
				props: { spacing: 1.5 },
				children: [ref("one"), ref("two"), ref("three")],
			},
			{ type: "Legato", children: [ref("one"), ref("two"), ref("three")] },
			{
				type: "Stretch",
				props: { beats: 3 },
				children: [ref("beat"), ref("three")],
			},
		]);
		expect(span("one")).toEqual([0, 1.5]);
		expect(span("two")).toEqual([1.5, 1.5]);
		expect(span("three")).toEqual([3, 1.5]);
		expect(warnings).toEqual([]);
	});

	it("staccato leaves gaps, and two relations on one length conflict", () => {
		const { span, warnings } = solve([
			dot("a"),
			dot("b"),
			motion("Enter", "x", "a"),
			motion("Enter", "y", "b", { at: 2 }),
			{
				type: "Staccato",
				props: { fraction: 0.25 },
				children: [ref("x"), ref("y")],
			},
			{ type: "Legato", children: [ref("x"), ref("y")] },
		]);
		expect(warnings.join()).toMatch(
			/conflicts with another relation over x:duration/,
		);
		// the two pull the length to a compromise; the warning is what matters
		expect(span("x")[1]).toBeGreaterThan(0.5);
	});

	it("eases a stagger so the cascade settles", () => {
		const { span } = solve([
			dot("a"),
			dot("b"),
			dot("c"),
			motion("Enter", "x", "a"),
			motion("Enter", "y", "b"),
			motion("Enter", "z", "c"),
			{
				type: "Stagger",
				props: { total: 1, ease: "out" },
				children: [ref("x"), ref("y"), ref("z")],
			},
		]);
		const at = (id: string) => span(id)[0] ?? 0;
		const gaps = [at("y") - at("x"), at("z") - at("y")];
		expect(gaps[0]).toBeGreaterThan(gaps[1]);
		expect(span("z")[0]).toBeCloseTo(1, 6);
	});
});
