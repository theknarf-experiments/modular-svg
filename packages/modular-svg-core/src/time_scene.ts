import {
	DEFAULT_OVER,
	type Ease,
	easeAt,
	intrinsicDuration,
	type MotionSpec,
	passesOf,
	resolveEase,
	type SampleFn,
	type Values,
} from "./motion.ts";
import type { LayoutOperator, NodeRecord } from "./solver/operators.ts";
import { type AngleSlots, slotDiff } from "./solver/solver.ts";
import {
	afterOp,
	articulateOp,
	atOp,
	type BeatGrid,
	beatLengthOp,
	beforeOp,
	duringOp,
	holdOp,
	lengthOp,
	onBeatOp,
	phraseOp,
	polyrhythmOp,
	sameTimeOp,
	sequenceOp,
	snapToGrid,
	staggerOp,
	stretchOp,
	type Tempo,
	TIME_EPSILON,
	type TimeAlignment,
	type TimeChild,
	timeUnionOp,
} from "./solver/time.ts";

export const MOTION_TYPES = new Set([
	"Motion",
	"Enter",
	"Exit",
	"Draw",
	"Shake",
	"Wiggle",
	"Sampled",
	"Travel",
]);

// Relations with a span of their own (they group their members in time)
const TIME_GROUPS = new Set([
	"Sequence",
	"SameTime",
	"Stagger",
	"Before",
	"Fermata",
]);
// Spans of their own with nothing inside: grids, silences and changes of layout
const TIME_LEAVES = new Set(["Beat", "Bar", "Rest", "Modulate", "Resolve"]);
const MODULATIONS = new Set(["Modulate", "Resolve"]);
// Pure constraints: no span, nothing to Ref
const TIME_CONSTRAINTS = new Set([
	"Legato",
	"Staccato",
	"After",
	"During",
	"Stretch",
	"At",
	"OnBeat",
	"Polyrhythm",
]);

// Clocks: a leaf in the time around them, with a time of their own inside
const TIME_CLOCKS = new Set(["Phrase"]);

export const TIME_TYPES = new Set([
	...TIME_GROUPS,
	...TIME_CONSTRAINTS,
	...TIME_LEAVES,
	...TIME_CLOCKS,
]);

type Props = Record<string, unknown>;

/** Motion spec from a node's props. */
export function motionSpecOf(type: string, props: Props): MotionSpec {
	const loop = props.loop as boolean | number | undefined;
	const ease = props.ease as Ease | undefined;
	const values = (k: string) => props[k] as Values | undefined;
	switch (type) {
		case "Enter":
			return { kind: "enter", from: values("from"), ease, loop };
		case "Exit":
			return { kind: "exit", to: values("to"), ease, loop };
		case "Draw":
			return { kind: "draw", ease, loop };
		case "Shake":
			return {
				kind: "shake",
				amplitude: values("amplitude") ?? { x: 6 },
				rate: props.rate as number | undefined,
				loop,
			};
		case "Wiggle":
			return {
				kind: "wiggle",
				amplitude: values("amplitude") ?? { rotate: 4 },
				seed: (props.seed as string | number | undefined) ?? 0,
				rate: props.rate as number | undefined,
				ease,
				loop: loop ?? true,
			};
		case "Travel":
			// Waypoints are filled in by the parser once the children are known
			return { kind: "travel", via: [], ease, loop };
		case "Sampled":
			if (typeof props.fn !== "function")
				throw new Error("Sampled needs an fn prop: (t) => values");
			return {
				kind: "sampled",
				fn: props.fn as SampleFn,
				tolerance: (props.tolerance as Record<string, number>) ?? {},
				step: props.step as number | undefined,
				loop,
			};
		default:
			return {
				kind: "motion",
				from: values("from"),
				steps:
					(props.steps as Extract<MotionSpec, { kind: "motion" }>["steps"]) ??
					[],
				loop,
			};
	}
}

export type TimeNode = {
	rec: NodeRecord;
	type: string;
	props: Props;
	/** every child, Refs included */
	children: NodeRecord[];
	/** non-Ref children */
	structural: NodeRecord[];
};

/** A post-solve check on the solved spans; returns a warning when violated. */
export type TimeCheck = (
	span: (id: string) => [number, number],
) => string | undefined;

export type TimeScene = {
	timeOperators: LayoutOperator[];
	timeOperatorNames: string[];
	timeSeed: number[];
	timedIds: string[];
	timeChecks: TimeCheck[];
	warnings: string[];
	/** the phrase whose time each node plays in; absent for scene time */
	clockOf: Map<string, string>;
	/** how each phrase plays its passes */
	phrases: Map<string, PhraseSpec>;
};

/** `repeat` is Infinity for a phrase that repeats until its enclosing time ends. */
export type PhraseSpec = {
	repeat: number;
	alternate: boolean;
	retrograde: boolean;
};

const num = (v: unknown, fallback: number): number =>
	typeof v === "number" && Number.isFinite(v) ? v : fallback;

/**
 * Compile time: each node gets (start, duration) slots. Motions are leaves,
 * marks and groups span the motions on them and their members, relations
 * become operators. `order` is the walk's post-order, so members precede the
 * relations over them, as Refs require. What a Phrase takes is solved in the
 * same array but in the phrase's own seconds, sealed from the time around it.
 */
export function buildTime(
	nodes: readonly NodeRecord[],
	order: readonly TimeNode[],
): TimeScene {
	const index = new Map(nodes.map((n, i) => [n.id, i]));
	const base = (id: string): number => (index.get(id) as number) * 2;
	const byId = new Map(order.map((t) => [t.rec.id, t]));
	const warnings: string[] = [];
	const timeChecks: TimeCheck[] = [];

	// Seeds: motions start at `at` (or 0) and last `over` (or their intrinsic length)
	const timeSeed: number[] = [];
	for (const n of nodes) {
		const t = byId.get(n.id);
		if (n.motion) {
			timeSeed.push(
				num(t?.props.at, 0),
				num(t?.props.over ?? t?.props.period, intrinsicDuration(n.motion)),
			);
		} else if (t?.type === "Beat") {
			const period =
				t.props.bpm !== undefined
					? 60 / num(t.props.bpm, 120)
					: num(t.props.period, 0.5);
			timeSeed.push(num(t.props.offset, 0), period);
		} else if (t && TIME_CLOCKS.has(t.type)) {
			timeSeed.push(num(t.props.at, 0), num(t.props.over, 0));
		} else if (t?.type === "Rest") {
			timeSeed.push(num(t.props.at, 0), num(t.props.over, 0.5));
		} else if (t && MODULATIONS.has(t.type)) {
			timeSeed.push(num(t.props.at, 0), num(t.props.over, DEFAULT_OVER));
		} else timeSeed.push(num(t?.props.at, 0), 0);
	}

	// Motions on each target, so a mark spans (and moves) its motions
	const motionsOn = new Map<string, NodeRecord[]>();
	for (const t of order) {
		if (!t.rec.motion) continue;
		for (const target of t.rec.targets ?? []) {
			motionsOn.set(target.id, [...(motionsOn.get(target.id) ?? []), t.rec]);
		}
	}

	const typeOf = (n: NodeRecord) => byId.get(n.id)?.type ?? "";
	const isClock = (n: NodeRecord) => TIME_CLOCKS.has(typeOf(n));
	const isLeaf = (n: NodeRecord) =>
		!!n.motion || TIME_LEAVES.has(typeOf(n)) || isClock(n);

	// What a node spans before clocks seal anything off
	const rawChildren = (n: NodeRecord): NodeRecord[] => {
		const t = byId.get(n.id);
		if (isLeaf(n) || (t && TIME_CONSTRAINTS.has(t.type))) return [];
		const members =
			t && TIME_GROUPS.has(t.type) ? t.children : (t?.structural ?? []);
		return [...(motionsOn.get(n.id) ?? []), ...members];
	};
	const rawTimedCache = new Map<string, boolean>();
	const rawTimed = (n: NodeRecord, seen = new Set<string>()): boolean => {
		const known = rawTimedCache.get(n.id);
		if (known !== undefined) return known;
		if (seen.has(n.id)) return false;
		seen.add(n.id);
		const yes = isLeaf(n) || rawChildren(n).some((c) => rawTimed(c, seen));
		if (yes) rawTimedCache.set(n.id, true);
		return yes;
	};

	// Clocks: a phrase takes its children and all they span, down to the next
	// phrase (whose own slot plays in this one's time)
	const clockOf = new Map<string, string>();
	const phraseNodes = order
		.filter((t) => TIME_CLOCKS.has(t.type))
		.sort((a, b) => base(a.rec.id) - base(b.rec.id));
	for (const p of phraseNodes) {
		// However the phrase got to it: directly, or through what it takes
		const refused = new Map<string, string>();
		const take = (n: NodeRecord): void => {
			if (n.id === p.rec.id) return;
			const owner = clockOf.get(n.id);
			if (owner !== undefined) {
				if (owner !== p.rec.id) refused.set(n.id, owner);
				return;
			}
			clockOf.set(n.id, p.rec.id);
			for (const c of rawChildren(n)) take(c);
		};
		for (const c of p.children) take(c);
		// Judged once everything is taken: a phrase this one holds keeps its own
		const within = (owner: string): boolean => {
			let at: string | undefined = owner;
			for (let d = 0; at !== undefined && d <= phraseNodes.length; d++) {
				if (at === p.rec.id) return true;
				at = clockOf.get(at);
			}
			return false;
		};
		for (const [id, owner] of refused)
			if (!within(owner))
				warnings.push(
					`Phrase(${p.rec.id}) takes ${id}, which already plays in Phrase(${owner})'s time`,
				);
	}
	// A relation declared outside over members of one phrase plays in it too
	for (const t of order) {
		if (
			!TIME_TYPES.has(t.type) ||
			TIME_CLOCKS.has(t.type) ||
			clockOf.has(t.rec.id)
		)
			continue;
		const members = t.children.filter((c) => rawTimed(c));
		const clock = members[0] && clockOf.get(members[0].id);
		if (clock && members.every((m) => clockOf.get(m.id) === clock))
			clockOf.set(t.rec.id, clock);
	}
	// The phrase a node's content was taken into, when not its own
	const takenInto = (
		n: NodeRecord,
		seen = new Set<string>(),
	): string | undefined => {
		if (seen.has(n.id)) return undefined;
		seen.add(n.id);
		for (const c of rawChildren(n)) {
			const clock = clockOf.get(c.id);
			if (clock !== clockOf.get(n.id)) return clock;
			const deeper = takenInto(c, seen);
			if (deeper) return deeper;
		}
		return undefined;
	};

	// Time children: what a node spans and carries along when moved; only what
	// plays in its own clock
	const timeChildren = (n: NodeRecord): NodeRecord[] => {
		const own = clockOf.get(n.id);
		return rawChildren(n).filter((c) => clockOf.get(c.id) === own);
	};

	const timed = new Set<string>();
	const isTimed = (n: NodeRecord, seen = new Set<string>()): boolean => {
		if (timed.has(n.id)) return true;
		if (seen.has(n.id)) return false;
		seen.add(n.id);
		const yes = isLeaf(n) || timeChildren(n).some((c) => isTimed(c, seen));
		if (yes) timed.add(n.id);
		return yes;
	};
	for (const n of nodes) isTimed(n);

	const subtreeCache = new Map<string, number[]>();
	const subtree = (n: NodeRecord, seen = new Set<string>()): number[] => {
		const cached = subtreeCache.get(n.id);
		if (cached) return cached;
		seen.add(n.id);
		const bases = [base(n.id)];
		for (const c of timeChildren(n)) {
			if (!seen.has(c.id) && timed.has(c.id)) bases.push(...subtree(c, seen));
		}
		const unique = [...new Set(bases)];
		subtreeCache.set(n.id, unique);
		return unique;
	};
	const child = (n: NodeRecord): TimeChild => ({
		base: base(n.id),
		subtree: subtree(n),
	});

	// Pinned: an absolute start (`at`, At, a Beat's offset) anywhere in the subtree.
	// Claimed: placed relative to something else by an exact relation.
	const ownPin = new Set<string>();
	for (const t of order) {
		if (
			// A beat without an offset may be placed by relations (a section's tempo)
			(t.type === "Beat" && t.props.offset !== undefined) ||
			(t.props.at !== undefined && !TIME_CONSTRAINTS.has(t.type))
		)
			ownPin.add(t.rec.id);
	}
	for (const t of order) {
		if (t.type === "At") for (const c of t.children) ownPin.add(c.id);
	}
	const pinned = (n: NodeRecord, seen = new Set<string>()): boolean => {
		if (ownPin.has(n.id)) return true;
		if (seen.has(n.id)) return false;
		seen.add(n.id);
		return timeChildren(n).some((c) => pinned(c, seen));
	};
	const claimed = new Set<string>();
	const anchorOf = (members: NodeRecord[]): number => {
		const i = members.findIndex((m) => pinned(m) || claimed.has(m.id));
		return i < 0 ? 0 : i;
	};
	const claim = (
		relation: string,
		members: NodeRecord[],
		anchor: number | null,
	): void => {
		members.forEach((m, i) => {
			if (i === anchor) return;
			if (pinned(m))
				warnings.push(`${relation} moves ${m.id}, whose start is pinned`);
			else if (claimed.has(m.id))
				warnings.push(
					`${relation} conflicts with another relation over ${m.id}:start`,
				);
			claimed.add(m.id);
		});
	};

	// Durations set by a relation: an explicit `over` or a second relation conflicts
	const durationClaimed = new Set<string>();
	const claimDurations = (relation: string, members: NodeRecord[]): void => {
		for (const m of members) {
			if (timeChildren(m).length > 0)
				warnings.push(
					`${relation}: ${m.id} is a group; wrap it in a Phrase to give it a length`,
				);
			else if (byId.get(m.id)?.props.over !== undefined)
				warnings.push(
					`${relation}: ${m.id} sets over, which ${relation} overrides`,
				);
			else if (durationClaimed.has(m.id))
				warnings.push(
					`${relation} conflicts with another relation over ${m.id}:duration`,
				);
			durationClaimed.add(m.id);
		}
	};

	// A Beat's tempo ramp: bpm -> toBpm (or period -> toPeriod) over `ramp` beats
	const tempoOf = (beat: NodeRecord): Tempo | undefined => {
		const p = byId.get(beat.id)?.props ?? {};
		const ramp = num(p.ramp, 0);
		if (!(ramp > 0)) return undefined;
		const ratio =
			p.toBpm !== undefined
				? num(p.bpm, 120) / num(p.toBpm, 120)
				: num(p.toPeriod, 1) / num(p.period, 1);
		return { ratio: ratio > 0 ? ratio : 1, ramp };
	};
	const isBeat = (n: NodeRecord) => byId.get(n.id)?.type === "Beat";
	const gridCheck = (
		relation: string,
		beat: NodeRecord,
		m: NodeRecord,
		grid: BeatGrid,
		align: "start" | "end",
	): void =>
		spanCheck(
			relation,
			(span) => {
				const [origin, period] = span(beat.id);
				const [s0, d] = span(m.id);
				const at = align === "end" ? s0 + d : s0;
				return (
					Math.abs(snapToGrid(at, origin, period, grid, "nearest") - at) <
					TIME_EPSILON * 10
				);
			},
			`${m.id} is off the beat`,
		);
	// Adjacent pairs a Sequence chains end-to-start, and pairs articulation ties
	const sequencePairs: { relation: string; a: string; b: string }[] = [];
	const articulatedPairs: { relation: string; a: string; b: string }[] = [];

	const ops: LayoutOperator[] = [];
	const spanCheck = (
		relation: string,
		test: (span: (id: string) => [number, number]) => boolean,
		message: string,
	): void => {
		timeChecks.push((span) =>
			test(span) ? undefined : `${relation}: ${message}`,
		);
	};

	// Which relation each operator came from, for the post-solve check
	const opNames: string[] = [];
	const nameNewOps = (name: string) => {
		while (opNames.length < ops.length) opNames.push(name);
	};

	for (const t of order) {
		const { rec, props } = t;
		const members = t.children.filter((c) => timed.has(c.id));
		const name = `${t.type}(${rec.id})`;

		if (TIME_TYPES.has(t.type) && !TIME_CLOCKS.has(t.type)) {
			const own = clockOf.get(rec.id);
			const related = t.children.filter((c) => rawTimed(c));
			for (const m of related) {
				if (clockOf.get(m.id) !== own || timed.has(m.id)) continue;
				const phrase = takenInto(m);
				if (phrase)
					warnings.push(
						`${name}: ${m.id} only moves inside Phrase(${phrase}); relate the Phrase`,
					);
			}
			// A relation only relates nodes that play in the same time
			const stranger = related.find((m) => clockOf.get(m.id) !== own);
			if (stranger) {
				const other =
					related.find((m) => clockOf.get(m.id) !== clockOf.get(stranger.id)) ??
					rec;
				const phrase = clockOf.get(stranger.id) ?? clockOf.get(other.id);
				warnings.push(
					`${name} relates ${other.id} and ${stranger.id}, which play in different time; relate Phrase(${phrase}) itself`,
				);
				continue;
			}
		}

		if (
			t.type !== "Beat" &&
			props.at !== undefined &&
			!TIME_CONSTRAINTS.has(t.type) &&
			timed.has(rec.id)
		) {
			ops.push(atOp([child(rec)], num(props.at, 0)));
		}

		if (t.type === "Sequence" && members.length > 1) {
			const anchor = anchorOf(members);
			claim(name, members, anchor);
			ops.push(
				sequenceOp(members.map(child), { gap: num(props.gap, 0), anchor }),
			);
			for (let i = 0; i + 1 < members.length; i++)
				sequencePairs.push({
					relation: name,
					a: members[i].id,
					b: members[i + 1].id,
				});
		} else if (t.type === "SameTime" && members.length > 1) {
			const anchor = anchorOf(members);
			claim(name, members, anchor);
			ops.push(
				sameTimeOp(members.map(child), {
					align: (props.align as TimeAlignment) ?? "start",
					anchor,
				}),
			);
		} else if (t.type === "Stagger" && members.length > 1) {
			const anchor = anchorOf(members);
			claim(name, members, anchor);
			const total =
				props.total !== undefined
					? num(props.total, 0)
					: num(props.spacing, 0.1) * (members.length - 1);
			const ease =
				props.ease !== undefined ? resolveEase(props.ease as Ease) : undefined;
			const shape = ease && ((x: number) => easeAt(ease, x));
			ops.push(staggerOp(members.map(child), { total, anchor, shape }));
		} else if (t.type === "At") {
			ops.push(atOp(members.map(child), num(props.time, 0)));
		} else if (t.type === "Before" && members.length > 1) {
			const gap = num(props.gap, 0);
			ops.push(
				beforeOp(members.map(child), {
					gap,
					movable: members.map((m) => !pinned(m)),
				}),
			);
			for (let i = 1; i < members.length; i++) {
				const [a, b] = [members[i - 1].id, members[i].id];
				spanCheck(
					name,
					(span) => span(b)[0] >= span(a)[0] + span(a)[1] + gap - TIME_EPSILON,
					`${b} starts before ${a} ends`,
				);
			}
		} else if (t.type === "After" && members.length > 1) {
			const [follower, ...leaders] = members;
			const gap = num(props.gap, 0);
			if (pinned(follower)) {
				// A pinned follower can only be checked, not moved
			} else
				ops.push(
					afterOp(
						child(follower),
						leaders.map((l) => base(l.id)),
						gap,
					),
				);
			for (const l of leaders) {
				spanCheck(
					name,
					(span) =>
						span(follower.id)[0] >=
						span(l.id)[0] + span(l.id)[1] + gap - TIME_EPSILON,
					`${follower.id} starts before ${l.id} ends`,
				);
			}
		} else if (t.type === "During" && members.length > 1) {
			const [outer, ...inner] = members;
			ops.push(
				duringOp(
					base(outer.id),
					inner.map(child),
					inner.map((m) => !pinned(m)),
				),
			);
			for (const m of inner) {
				spanCheck(
					name,
					(span) => {
						const [s, d] = span(m.id);
						const [os, od] = span(outer.id);
						return s >= os - TIME_EPSILON && s + d <= os + od + TIME_EPSILON;
					},
					`${m.id} runs outside ${outer.id}`,
				);
			}
		} else if (t.type === "Stretch" && members.length > 1) {
			const [source, ...targets] = members;
			claimDurations(name, targets);
			if (props.beats !== undefined) {
				// Note values: only lengths, in multiples of the source's; a
				// Beat's are counted in its own (possibly changing) tempo
				const targetsBases = targets.map((m) => base(m.id));
				ops.push(
					isBeat(source)
						? beatLengthOp(
								base(source.id),
								targetsBases,
								num(props.beats, 1),
								tempoOf(source),
							)
						: lengthOp(base(source.id), targetsBases, num(props.beats, 1)),
				);
			} else {
				claim(name, targets, null);
				ops.push(stretchOp(base(source.id), targets.map(child)));
			}
		} else if (
			(t.type === "Legato" || t.type === "Staccato") &&
			members.length > 1
		) {
			// The last member has no next start, so it keeps its own length
			claimDurations(name, members.slice(0, -1));
			const fill = num(props.fraction, t.type === "Legato" ? 1 : 0.5);
			ops.push(
				articulateOp(
					members.map((m) => base(m.id)),
					fill,
				),
			);
			for (let i = 0; i + 1 < members.length; i++) {
				const [a, b] = [members[i].id, members[i + 1].id];
				articulatedPairs.push({ relation: name, a, b });
				spanCheck(
					name,
					(span) => span(b)[0] >= span(a)[0] - TIME_EPSILON,
					`${b} starts before ${a}`,
				);
			}
		} else if (t.type === "OnBeat" && members.length > 1) {
			const [beat, ...rest] = members;
			if (!isBeat(beat))
				warnings.push(
					`${name}: the first member must be a Beat, got ${beat.id}`,
				);
			const grid: BeatGrid = {
				every: num(props.every, 1),
				division: Math.max(1, num(props.division, 1)),
				offset: num(props.offset, 0),
				swing: num(props.swing, 0.5),
				tempo: tempoOf(beat),
			};
			const align =
				props.align === "end" ? ("end" as const) : ("start" as const);
			const snap = props.snap === "nearest" ? "nearest" : "next";
			ops.push(
				onBeatOp(base(beat.id), rest.map(child), {
					...grid,
					align,
					snap,
					movable: rest.map((m) => !pinned(m)),
				}),
			);
			for (const m of rest) gridCheck(name, beat, m, grid, align);
		} else if (t.type === "Bar") {
			// A bar starts on a bar line and lasts `count` bars of `beats` beats
			const beat = t.children[0];
			if (!beat || !isBeat(beat)) {
				warnings.push(`${name}: the first child must be a Beat`);
			} else {
				const beats = num(props.beats, 4);
				const grid: BeatGrid = {
					every: beats,
					division: 1,
					offset: 0,
					swing: 0.5,
					tempo: tempoOf(beat),
				};
				ops.push(
					onBeatOp(base(beat.id), [child(rec)], {
						...grid,
						align: "start",
						snap: "next",
						movable: [!pinned(rec)],
					}),
					beatLengthOp(
						base(beat.id),
						[base(rec.id)],
						beats * num(props.count, 1),
						grid.tempo,
					),
				);
				gridCheck(name, beat, rec, grid, "start");
			}
		} else if (t.type === "Polyrhythm" && members.length === 2) {
			const [a, b] = members;
			if (!isBeat(a) || !isBeat(b))
				warnings.push(`${name}: both members must be Beats`);
			const of = (props.of as [number, number] | undefined) ?? [3, 2];
			ops.push(polyrhythmOp(base(a.id), base(b.id), of));
		} else if (t.type === "Resolve") {
			for (const c of t.children)
				if (typeOf(c) !== "Modulate")
					warnings.push(`${name} releases ${c.id}, which is not a Modulate`);
		}

		nameNewOps(name);

		// Spans last, so a group re-derives itself after its relation moved members
		const spanned = timeChildren(rec).filter((c) => timed.has(c.id));
		if (spanned.length > 0)
			ops.push(
				t.type === "Fermata"
					? holdOp(
							spanned.map((c) => base(c.id)),
							base(rec.id),
							num(props.hold, 1),
						)
					: timeUnionOp(
							spanned.map((c) => base(c.id)),
							base(rec.id),
						),
			);
		nameNewOps(`span(${rec.id})`);
	}

	// Nodes that existed before any relation still need their unions
	for (const n of nodes) {
		if (byId.has(n.id)) continue;
		const spanned = timeChildren(n).filter((c) => timed.has(c.id));
		if (spanned.length > 0)
			ops.push(
				timeUnionOp(
					spanned.map((c) => base(c.id)),
					base(n.id),
				),
			);
		nameNewOps(`span(${n.id})`);
	}

	// Phrases: the span follows from what plays inside, unless something sets it.
	// After the loop, since a later Stretch may claim the length
	const playing = new Map<string, NodeRecord[]>();
	for (const n of nodes) {
		const clock = clockOf.get(n.id);
		if (clock === undefined || !timed.has(n.id)) continue;
		const members = playing.get(clock);
		if (members) members.push(n);
		else playing.set(clock, [n]);
	}
	const phrases = new Map<string, PhraseSpec>();
	for (const { rec, props } of phraseNodes) {
		const name = `Phrase(${rec.id})`;
		const count =
			props.repeat === true
				? Infinity
				: props.repeat === undefined || props.repeat === false
					? 1
					: Math.floor(num(props.repeat, 0));
		if (!(count >= 1))
			warnings.push(`${name}: repeat must be at least 1; playing it once`);
		const repeat = count >= 1 ? count : 1;
		if (props.rate !== undefined && !(num(props.rate, 0) > 0))
			warnings.push(`${name}: rate must be above 0; playing at 1`);
		const rate = num(props.rate, 0) > 0 ? num(props.rate, 1) : 1;
		const alternate = props.alternate === true;
		if (alternate && repeat === 1)
			warnings.push(`${name}: alternate needs repeat`);
		phrases.set(rec.id, {
			repeat,
			alternate,
			retrograde: props.retrograde === true,
		});
		const members = playing.get(rec.id) ?? [];
		const given = props.over !== undefined;
		if (given && !(num(props.over, 0) > 0))
			warnings.push(`${name}: over must be above 0; playing at its own length`);
		const sized =
			(given && num(props.over, 0) > 0) || durationClaimed.has(rec.id);
		if (sized && props.rate !== undefined)
			warnings.push(`${name}: rate is overridden by its length`);
		if (!sized)
			ops.push(
				phraseOp(
					members.map((m) => base(m.id)),
					base(rec.id),
					{
						rate,
						repeat: Number.isFinite(repeat) ? repeat : 1,
						passes: members.map((m) => passesOf(m.motion?.loop)),
					},
				),
			);
		nameNewOps(`span(${rec.id})`);

		const ids = members.map((m) => m.id);
		timeChecks.push((span) =>
			!ids.some((id) => span(id)[0] + span(id)[1] > TIME_EPSILON)
				? `${name} has nothing to play`
				: span(rec.id)[1] > TIME_EPSILON
					? undefined
					: `${name} lasts ${Math.round(span(rec.id)[1] * 1000) / 1000}s, so nothing in it plays`,
		);
		timeChecks.push(earliestCheck(ids, `${name} starts`, "the phrase"));
	}

	// A change of layout that starts before the one before it has settled
	const changes = new Map<string | undefined, TimeNode[]>();
	for (const t of order) {
		if (!MODULATIONS.has(t.type)) continue;
		const clock = clockOf.get(t.rec.id);
		const list = changes.get(clock);
		if (list) list.push(t);
		else changes.set(clock, [t]);
	}
	for (const list of changes.values()) {
		const sorted = [...list].sort((a, b) => base(a.rec.id) - base(b.rec.id));
		// The change before each one: by start, ties in document order. Worked
		// out once per solution, not once per change
		let known:
			| { span: Parameters<TimeCheck>[0]; before: Map<string, TimeNode> }
			| undefined;
		const beforeIn = (span: Parameters<TimeCheck>[0]) => {
			if (known?.span === span) return known.before;
			const byStart = [...sorted].sort(
				(a, b) => span(a.rec.id)[0] - span(b.rec.id)[0],
			);
			const before = new Map(
				byStart.slice(1).map((t, i) => [t.rec.id, byStart[i]]),
			);
			known = { span, before };
			return before;
		};
		for (const t of sorted) {
			timeChecks.push((span) => {
				const prev = beforeIn(span).get(t.rec.id);
				if (!prev) return undefined;
				const [start, over] = span(prev.rec.id);
				return span(t.rec.id)[0] < start + over - TIME_EPSILON
					? `${t.type}(${t.rec.id}) starts while ${prev.type}(${prev.rec.id}) is still settling; ${prev.rec.id} is cut short`
					: undefined;
			});
		}
	}

	// A Sequence sets b's start from a's length while Legato sets a's length
	// from b's start: together they are circular and the length is arbitrary
	for (const art of articulatedPairs) {
		const seq = sequencePairs.find((p) => p.a === art.a && p.b === art.b);
		if (seq)
			warnings.push(
				`${art.relation} and ${seq.relation} both tie ${art.a} to ${art.b}: the length of ${art.a} is undetermined; place ${art.b} with something else (Stagger, OnBeat, At)`,
			);
	}

	timeChecks.push(
		earliestCheck(
			[...timed].filter((id) => !clockOf.has(id)),
			"the schedule starts",
			"the scene",
		),
	);

	return {
		timeOperators: ops,
		timeOperatorNames: opNames,
		timeSeed,
		timedIds: nodes.filter((n) => timed.has(n.id)).map((n) => n.id),
		timeChecks,
		warnings,
		clockOf,
		phrases,
	};
}

// One warning for the earliest start, not one per node under it
const earliestCheck =
	(ids: readonly string[], what: string, where: string): TimeCheck =>
	(span) => {
		let first: string | undefined;
		for (const id of ids)
			if (first === undefined || span(id)[0] < span(first)[0]) first = id;
		if (first === undefined || span(first)[0] >= -TIME_EPSILON)
			return undefined;
		return `${what} at ${Math.round(span(first)[0] * 1000) / 1000}s (${first}), before ${where}`;
	};

/**
 * Relations that a solved state does not satisfy: apply each operator once
 * more and report those that would still move something. Catches every
 * kind of relation, including over-constraints the parse-time checks miss.
 * `mirror` is a copy of `values` to work in (and a copy again on return), for
 * a caller that checks many states that differ in a few places.
 */
export function unsettled(
	values: Float64Array,
	operators: readonly LayoutOperator[],
	names: readonly string[],
	tolerance: number,
	angles?: AngleSlots,
	mirror?: Float64Array,
): string[] {
	// next mirrors values; each operator's declared writes are checked and reset
	const next = mirror ?? new Float64Array(values);
	const failing = new Set<string>();
	operators.forEach((op, i) => {
		op(values, next);
		const written = op.writes ?? next.keys();
		for (const k of written) {
			// A non-finite value means the solve diverged: that never holds
			const moved = Math.abs(slotDiff(values[k], next[k], k, angles));
			if (!(moved <= tolerance)) failing.add(names[i] ?? `relation #${i}`);
			next[k] = values[k];
		}
	});
	// Spans only follow their members; name them only if nothing else fails
	const relations = [...failing].filter((n) => !n.startsWith("span("));
	return relations.length > 0 ? relations : [...failing];
}

export const unsettledMessage = (domain: string, names: readonly string[]) =>
	names.length === 1
		? `${names[0]} does not hold in the solved ${domain}`
		: `${names.join(", ")} cannot all hold; the ${domain} did not settle`;

/** Problems with a solved schedule: unsatisfied relations, violated inequalities, off-beat and negative starts. */
export function checkTime(
	scene: {
		nodes?: readonly NodeRecord[];
		timeChecks?: readonly TimeCheck[];
		timeOperators?: readonly LayoutOperator[];
		timeOperatorNames?: readonly string[];
		timeSeed?: readonly number[];
	},
	layout: Record<
		string,
		{
			start?: number;
			duration?: number;
			local?: { start: number; duration: number };
		}
	>,
): string[] {
	// Relations hold in the time their members play in
	const own = (id: string) => layout[id]?.local ?? layout[id];
	const span = (id: string): [number, number] => [
		own(id)?.start ?? 0,
		own(id)?.duration ?? 0,
	];
	const warnings = (scene.timeChecks ?? [])
		.map((check) => check(span))
		.filter((w): w is string => w !== undefined);
	const diverged = Object.entries(layout).find(
		([, b]) =>
			(b.start !== undefined && !Number.isFinite(b.start)) ||
			(b.duration !== undefined && !Number.isFinite(b.duration)),
	);
	if (diverged)
		warnings.unshift(
			`the schedule diverged (${diverged[0]} has no finite time); its relations contradict each other`,
		);
	if (scene.nodes && scene.timeOperators?.length && scene.timeSeed) {
		const times = new Float64Array(scene.timeSeed);
		scene.nodes.forEach((n, i) => {
			const box = own(n.id);
			if (box?.start !== undefined) times[i * 2] = box.start;
			if (box?.duration !== undefined) times[i * 2 + 1] = box.duration;
		});
		const names = unsettled(
			times,
			scene.timeOperators,
			scene.timeOperatorNames ?? [],
			1e-3,
		);
		if (names.length > 0) warnings.unshift(unsettledMessage("schedule", names));
	}
	return warnings;
}
