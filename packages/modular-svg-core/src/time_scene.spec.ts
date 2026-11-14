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

	it("makes bars spans you can sequence and fit things into", () => {
		const { span, warnings } = solve([
			dot("a"),
			{ type: "Beat", id: "beat", props: { bpm: 120 } },
			{
				type: "Bar",
				id: "intro",
				props: { count: 2 },
				children: [ref("beat")],
			},
			{ type: "Bar", id: "verse", children: [ref("beat")] },
			{ type: "Sequence", children: [ref("intro"), ref("verse")] },
			motion("Enter", "x", "a"),
			{ type: "Stretch", children: [ref("verse"), ref("x")] },
		]);
		expect(span("intro")).toEqual([0, 4]);
		expect(span("verse")).toEqual([4, 2]);
		expect(span("x")).toEqual([4, 2]);
		expect(warnings).toEqual([]);
	});

	it("bars land on bar lines", () => {
		const { span } = solve([
			dot("a"),
			{ type: "Beat", id: "beat", props: { bpm: 60 } },
			motion("Enter", "x", "a", { over: 1.5 }),
			{ type: "Bar", id: "next", props: { beats: 3 }, children: [ref("beat")] },
			{ type: "Before", children: [ref("x"), ref("next")] },
		]);
		expect(span("next")).toEqual([3, 3]);
	});

	it("swings offbeats and follows a ritardando", () => {
		const { span, warnings } = solve([
			dot("a"),
			dot("b"),
			{ type: "Beat", id: "swung", props: { bpm: 60 } },
			{ type: "Beat", id: "slowing", props: { bpm: 60, toBpm: 30, ramp: 4 } },
			motion("Enter", "x", "a", { at: 0.55 }),
			motion("Enter", "y", "b", { at: 2.1 }),
			{
				type: "OnBeat",
				props: { division: 2, swing: 2 / 3 },
				children: [ref("swung"), ref("x")],
			},
			{ type: "OnBeat", children: [ref("slowing"), ref("y")] },
		]);
		// x and y are pinned by at, so they stay and the checks say so
		expect(warnings.join()).toMatch(/x is off the beat/);
		expect(span("y")[0]).toBe(2.1);

		const free = solve([
			dot("a"),
			dot("b"),
			{ type: "Beat", id: "swung", props: { bpm: 60 } },
			{ type: "Beat", id: "slowing", props: { bpm: 60, toBpm: 30, ramp: 4 } },
			motion("Enter", "x", "a"),
			motion("Enter", "y", "b"),
			motion("Enter", "z", "b"),
			{ type: "Before", props: { gap: 0.05 }, children: [ref("x"), ref("z")] },
			{
				type: "OnBeat",
				props: { division: 2, swing: 2 / 3 },
				children: [ref("swung"), ref("z")],
			},
			{
				type: "Stretch",
				props: { beats: 1 },
				children: [ref("slowing"), ref("y")],
			},
		]);
		expect(free.span("z")[0]).toBeCloseTo(2 / 3, 6);
		// one beat from the downbeat of a slowing tempo lasts longer than the first period
		expect(free.span("y")[1]).toBe(1.125);
		expect(free.warnings).toEqual([]);
	});

	it("rests and fermatas hold time without touching what they hold", () => {
		const { span } = solve([
			dot("a"),
			dot("b"),
			motion("Enter", "x", "a", { over: 1 }),
			motion("Enter", "y", "b", { over: 1 }),
			{ type: "Fermata", id: "held", props: { hold: 2 }, children: [ref("x")] },
			{ type: "Rest", id: "breath", props: { over: 0.5 } },
			{ type: "Sequence", children: [ref("held"), ref("breath"), ref("y")] },
		]);
		expect(span("x")).toEqual([0, 1]);
		expect(span("held")).toEqual([0, 3]);
		expect(span("y")[0]).toBe(3.5);
	});

	it("locks beats into a polyrhythm", () => {
		const { span } = solve([
			{ type: "Beat", id: "three", props: { bpm: 90, offset: 1 } },
			{ type: "Beat", id: "two", props: { bpm: 60 } },
			{
				type: "Polyrhythm",
				props: { of: [3, 2] },
				children: [ref("three"), ref("two")],
			},
		]);
		expect(span("two")[0]).toBe(1);
		expect(span("two")[1]).toBeCloseTo((60 / 90) * 1.5, 6);
	});

	it("warns when Legato and Sequence tie the same pair", () => {
		const { warnings } = solve([
			dot("a"),
			dot("b"),
			motion("Enter", "x", "a"),
			motion("Enter", "y", "b"),
			{ type: "Sequence", children: [ref("x"), ref("y")] },
			{ type: "Legato", children: [ref("x"), ref("y")] },
		]);
		expect(warnings.join()).toMatch(
			/both tie x to y: the length of x is undetermined/,
		);
	});

	it("places a beat without an offset, so a tempo can start with its section", () => {
		const { span } = solve([
			dot("a"),
			{ type: "Beat", id: "beat", props: { bpm: 120 } },
			{ type: "Bar", id: "intro", children: [ref("beat")] },
			{ type: "Beat", id: "faster", props: { bpm: 120, toBpm: 240, ramp: 4 } },
			{ type: "Sequence", children: [ref("intro"), ref("faster")] },
			motion("Enter", "x", "a", { over: 0.1 }),
			{
				type: "Stretch",
				props: { beats: 4 },
				children: [ref("faster"), ref("x")],
			},
			{ type: "Sequence", children: [ref("intro"), ref("x")] },
		]);
		expect(span("faster")[0]).toBe(2);
		// four beats ramping 0.5s -> 0.25s take 0.5*4 - 0.25*4/2 = 1.5s
		expect(span("x")).toEqual([2, 1.5]);
	});

	it("names relations that cannot all hold instead of drifting silently", () => {
		const { warnings } = solve([
			dot("a"),
			dot("b"),
			motion("Enter", "x", "a", { over: 0.2 }),
			motion("Enter", "y", "b", { over: 0.2 }),
			{ type: "Sequence", id: "tight", children: [ref("x"), ref("y")] },
			{
				type: "Sequence",
				id: "loose",
				props: { gap: 0.25 },
				children: [ref("x"), ref("y")],
			},
		]);
		expect(warnings[0]).toBe(
			"Sequence(tight), Sequence(loose) cannot all hold; the schedule did not settle",
		);
		// the drift is reported once, not per node
		expect(warnings.filter((w) => w.includes("before the scene"))).toHaveLength(
			1,
		);
	});
});

describe("Phrase", () => {
	const pair = [
		dot("a"),
		dot("b"),
		motion("Enter", "aIn", "a", { over: 1 }),
		motion("Enter", "bIn", "b", { over: 0.5 }),
	];
	const reveal: N = {
		type: "Sequence",
		id: "reveal",
		props: { gap: 0.5 },
		children: [ref("aIn"), ref("bIn")],
	};
	const phrase = (
		id: string,
		props: Record<string, unknown>,
		children: N[] = [reveal],
	): N => ({ type: "Phrase", id, props, children });

	it("is as long as what plays inside it, in its own time", () => {
		const { span, layout, warnings } = solve([...pair, phrase("p", { at: 3 })]);
		expect(span("p")).toEqual([3, 2]);
		expect(layout.p.length).toBe(2);
		// inside: phrase seconds; outside: where the first pass lands
		expect(layout.bIn.local).toEqual({ start: 1.5, duration: 0.5 });
		expect(span("bIn")).toEqual([4.5, 0.5]);
		expect(span("reveal")).toEqual([3, 2]);
		expect(warnings).toEqual([]);
	});

	it("makes a sequence wait for every pass", () => {
		const { span, warnings } = solve([
			...pair,
			dot("c"),
			motion("Enter", "cIn", "c", { over: 1 }),
			phrase("p", { repeat: 3 }),
			{ type: "Sequence", children: [ref("p"), ref("cIn")] },
		]);
		expect(span("p")).toEqual([0, 6]);
		expect(span("cIn")).toEqual([6, 1]);
		expect(warnings).toEqual([]);
	});

	it("plays faster at a higher rate, and backwards under retrograde", () => {
		const fast = solve([...pair, phrase("p", { rate: 2 })]);
		expect(fast.span("p")).toEqual([0, 1]);
		expect(fast.span("bIn")).toEqual([0.75, 0.25]);
		const back = solve([...pair, phrase("p", { retrograde: true })]);
		expect(back.span("bIn")).toEqual([0, 0.5]);
		expect(back.span("aIn")).toEqual([1, 1]);
	});

	it("takes its whole span from over, shared by its passes", () => {
		const { span, layout } = solve([
			...pair,
			phrase("p", { over: 3, repeat: 3 }),
		]);
		expect(span("p")).toEqual([0, 3]);
		expect(layout.p.length).toBe(2);
		expect(span("aIn")).toEqual([0, 0.5]);
	});

	it("is stretched as a unit: Stretch beats scales the gaps inside", () => {
		const { span, warnings } = solve([
			...pair,
			{ type: "Beat", id: "beat", props: { bpm: 120 } },
			phrase("p", {}),
			{
				type: "Stretch",
				props: { beats: 8 },
				children: [ref("beat"), ref("p")],
			},
		]);
		expect(span("p")).toEqual([0, 4]);
		expect(span("aIn")).toEqual([0, 2]);
		expect(span("bIn")).toEqual([3, 1]);
		expect(warnings).toEqual([]);
	});

	it("keeps a pin inside local: it does not pin the phrase", () => {
		const { span, layout, warnings } = solve([
			...pair,
			dot("c"),
			motion("Enter", "cIn", "c", { over: 1 }),
			phrase("p", {}, [
				{
					type: "Sequence",
					id: "late",
					props: { at: 1 },
					children: [ref("aIn"), ref("bIn")],
				},
			]),
			{ type: "Sequence", children: [ref("cIn"), ref("p")] },
		]);
		expect(span("p")).toEqual([1, 2.5]);
		expect(layout.aIn.local?.start).toBe(1);
		expect(span("aIn")[0]).toBe(2);
		expect(warnings).toEqual([]);
	});

	it("lets a later relation over one phrase's members play inside it", () => {
		const { layout, span, warnings } = solve([
			dot("a"),
			dot("b"),
			motion("Enter", "aIn", "a"),
			motion("Enter", "bIn", "b"),
			phrase("p", {}, [
				{
					type: "Stagger",
					props: { spacing: 0.25 },
					children: [ref("aIn"), ref("bIn")],
				},
			]),
			{ type: "Legato", id: "tie", children: [ref("aIn"), ref("bIn")] },
		]);
		expect(layout.aIn.local).toEqual({ start: 0, duration: 0.25 });
		expect(span("p")).toEqual([0, 0.75]);
		expect(warnings).toEqual([]);
	});

	it("nests: the inner phrase is a leaf in the outer one's time", () => {
		const { span, layout, warnings } = solve([
			...pair,
			phrase("outer", { rate: 2 }, [
				phrase("inner", { repeat: 2 }, [ref("aIn")]),
				{ type: "Sequence", children: [ref("inner"), ref("bIn")] },
			]),
		]);
		expect(layout.inner.local).toEqual({ start: 0, duration: 2 });
		expect(span("inner")).toEqual([0, 1]);
		expect(span("outer")).toEqual([0, 1.25]);
		expect(span("aIn")).toEqual([0, 0.5]);
		expect(span("bIn")).toEqual([1, 0.25]);
		expect(warnings).toEqual([]);
	});

	it("warns when two phrases take the same node; the first keeps it", () => {
		const { scene, warnings } = solve([
			...pair,
			phrase("p", {}, [ref("aIn")]),
			phrase("q", {}, [ref("aIn"), ref("bIn")]),
		]);
		expect(warnings).toContain(
			"Phrase(q) takes aIn, which already plays in Phrase(p)'s time",
		);
		expect(scene.nodes.find((n) => n.id === "aIn")?.clock).toBe("p");
	});

	it("warns when a relation reaches across clocks, and drops it", () => {
		const { span, warnings } = solve([
			...pair,
			phrase("p", {}, [ref("aIn")]),
			{ type: "Sequence", id: "s", children: [ref("aIn"), ref("bIn")] },
		]);
		expect(warnings).toEqual([
			"Sequence(s) relates bIn and aIn, which play in different time; relate Phrase(p) itself",
		]);
		expect(span("bIn")).toEqual([0, 0.5]);
	});

	it("warns when a member only moves inside a phrase", () => {
		const { warnings } = solve([
			...pair,
			phrase("p", {}, [ref("aIn")]),
			{ type: "Sequence", id: "s", children: [ref("a"), ref("b")] },
		]);
		expect(warnings).toEqual([
			"Sequence(s): a only moves inside Phrase(p); relate the Phrase",
		]);
	});

	it("warns about props that cannot apply", () => {
		const w = (props: Record<string, unknown>) =>
			solve([...pair, phrase("p", props)]).warnings;
		expect(w({ rate: 2, over: 1 })).toEqual([
			"Phrase(p): rate is overridden by its length",
		]);
		expect(w({ alternate: true })).toEqual([
			"Phrase(p): alternate needs repeat",
		]);
		expect(w({ rate: 0 })).toEqual([
			"Phrase(p): rate must be above 0; playing at 1",
		]);
		expect(w({ repeat: 0 })).toEqual([
			"Phrase(p): repeat must be at least 1; playing it once",
		]);
		const claimed = solve([
			...pair,
			{ type: "Beat", id: "beat", props: { bpm: 60 } },
			phrase("p", { rate: 2 }),
			{
				type: "Stretch",
				props: { beats: 2 },
				children: [ref("beat"), ref("p")],
			},
		]);
		expect(claimed.warnings).toEqual([
			"Phrase(p): rate is overridden by its length",
		]);
	});

	it("points a stretched group at Phrase", () => {
		const { warnings } = solve([
			...pair,
			{ type: "Beat", id: "beat", props: { bpm: 60 } },
			reveal,
			{
				type: "Stretch",
				id: "st",
				props: { beats: 2 },
				children: [ref("beat"), ref("reveal")],
			},
		]);
		expect(warnings).toContain(
			"Stretch(st): reveal is a group; wrap it in a Phrase to give it a length",
		);
	});

	it("checks a phrase with nothing to play, and starts before the phrase", () => {
		expect(solve([dot("a"), phrase("p", {}, [])]).warnings).toEqual([
			"Phrase(p) has nothing to play",
		]);
		const early = solve([
			...pair,
			phrase("p", { at: 2 }, [
				motion("Enter", "cIn", "a", { at: -0.5, over: 1 }),
			]),
		]);
		expect(early.warnings).toEqual([
			"Phrase(p) starts at -0.5s (cIn), before the phrase",
		]);
	});
});

describe("Modulate and Resolve", () => {
	const row: N = { type: "StackH", id: "row", children: [dot("a"), dot("b")] };
	const swap = (id: string, props: Record<string, unknown> = {}): N => ({
		type: "Modulate",
		id,
		props,
		children: [{ type: "StackH", children: [ref("b"), ref("a")] }],
	});

	it("are leaves: half a second unless told, pinned by at, placed by relations", () => {
		const { span, warnings } = solve([
			row,
			motion("Enter", "aIn", "a", { over: 1 }),
			swap("m"),
			{ type: "Resolve", id: "r", props: { over: 0.2 } },
			{ type: "Sequence", children: [ref("aIn"), ref("m"), ref("r")] },
			swap("pinned", { at: 3, over: 1 }),
		]);
		expect(warnings).toEqual([]);
		expect(span("m")).toEqual([1, 0.5]);
		expect(span("r")).toEqual([1.5, 0.2]);
		expect(span("pinned")).toEqual([3, 1]);
		// what a Modulate holds takes no time of its own
		expect(span("row")).toEqual([0, 1]);
	});

	it("play in the phrase that takes them, and a Resolve over them joins it", () => {
		const { layout, warnings } = solve([
			row,
			{
				type: "Phrase",
				id: "p",
				props: { at: 2, repeat: 2 },
				children: [swap("m", { over: 1 })],
			},
			{ type: "Resolve", id: "r", props: { at: 1 }, children: [ref("m")] },
		]);
		expect(warnings).toEqual([]);
		expect(layout.m.local).toEqual({ start: 0, duration: 1 });
		expect(layout.r.local).toEqual({ start: 1, duration: 0.5 });
		expect(layout.p).toMatchObject({ start: 2, duration: 3, length: 1.5 });
	});
});
