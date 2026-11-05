import {
	type Ease,
	intrinsicDuration,
	type MotionSpec,
	type SampleFn,
	type Values,
} from "./motion.ts";
import type { LayoutOperator, NodeRecord } from "./solver/operators.ts";
import {
	afterOp,
	atOp,
	beforeOp,
	duringOp,
	onBeatOp,
	sameTimeOp,
	sequenceOp,
	staggerOp,
	stretchOp,
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
]);

// Relations with a span of their own (they group their members in time)
const TIME_GROUPS = new Set(["Sequence", "SameTime", "Stagger", "Before"]);
// Pure constraints: no span, nothing to Ref
const TIME_CONSTRAINTS = new Set([
	"After",
	"During",
	"Stretch",
	"At",
	"OnBeat",
]);

export const TIME_TYPES = new Set([
	...TIME_GROUPS,
	...TIME_CONSTRAINTS,
	"Beat",
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
	timeSeed: number[];
	timedIds: string[];
	timeChecks: TimeCheck[];
	warnings: string[];
};

const num = (v: unknown, fallback: number): number =>
	typeof v === "number" && Number.isFinite(v) ? v : fallback;

/**
 * Compile time: each node gets (start, duration) slots. Motions are leaves,
 * marks and groups span the motions on them and their members, relations
 * become operators. `order` is the walk's post-order, so members precede the
 * relations over them, as Refs require.
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
		} else timeSeed.push(num(t?.props.at, 0), 0);
	}

	// Motions on each target, so a mark spans (and moves) its motions
	const motionsOn = new Map<string, NodeRecord[]>();
	for (const t of order) {
		if (!t.rec.motion) continue;
		for (const target of t.children) {
			motionsOn.set(target.id, [...(motionsOn.get(target.id) ?? []), t.rec]);
		}
	}

	// Time children: what a node spans and carries along when moved
	const timeChildren = (n: NodeRecord): NodeRecord[] => {
		const t = byId.get(n.id);
		if (n.motion || t?.type === "Beat" || (t && TIME_CONSTRAINTS.has(t.type)))
			return [];
		const members =
			t && TIME_GROUPS.has(t.type) ? t.children : (t?.structural ?? []);
		return [...(motionsOn.get(n.id) ?? []), ...members];
	};

	const timed = new Set<string>();
	const isTimed = (n: NodeRecord, seen = new Set<string>()): boolean => {
		if (timed.has(n.id)) return true;
		if (seen.has(n.id)) return false;
		seen.add(n.id);
		const t = byId.get(n.id);
		const yes =
			!!n.motion ||
			t?.type === "Beat" ||
			timeChildren(n).some((c) => isTimed(c, seen));
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

	// Pinned: an absolute start (`at`, At, a Beat) anywhere in the subtree.
	// Claimed: placed relative to something else by an exact relation.
	const ownPin = new Set<string>();
	for (const t of order) {
		if (
			t.type === "Beat" ||
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

	for (const t of order) {
		const { rec, props } = t;
		const members = t.children.filter((c) => timed.has(c.id));
		const name = `${t.type}(${rec.id})`;

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
			const spacing =
				props.total !== undefined
					? num(props.total, 0) / (members.length - 1)
					: num(props.spacing, 0.1);
			ops.push(staggerOp(members.map(child), { spacing, anchor }));
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
			for (const m of targets) {
				if (timeChildren(m).length > 0)
					warnings.push(
						`${name}: ${m.id} is a group; only motions and beats stretch`,
					);
				if (byId.get(m.id)?.props.over !== undefined)
					warnings.push(`${name}: ${m.id} sets over, which Stretch overrides`);
			}
			claim(name, targets, null);
			ops.push(stretchOp(base(source.id), targets.map(child)));
		} else if (t.type === "OnBeat" && members.length > 1) {
			const [beat, ...rest] = members;
			if (byId.get(beat.id)?.type !== "Beat")
				warnings.push(
					`${name}: the first member must be a Beat, got ${beat.id}`,
				);
			const every = num(props.every, 1);
			const snap = props.snap === "nearest" ? "nearest" : "next";
			ops.push(
				onBeatOp(base(beat.id), rest.map(child), {
					every,
					snap,
					movable: rest.map((m) => !pinned(m)),
				}),
			);
			for (const m of rest) {
				spanCheck(
					name,
					(span) => {
						const [origin, period] = span(beat.id);
						const k = (span(m.id)[0] - origin) / (period * every);
						return (
							Math.abs(k - Math.round(k)) * period * every < TIME_EPSILON * 10
						);
					},
					`${m.id} is off the beat`,
				);
			}
		}

		// Spans last, so a group re-derives itself after its relation moved members
		const spanned = timeChildren(rec).filter((c) => timed.has(c.id));
		if (spanned.length > 0)
			ops.push(
				timeUnionOp(
					spanned.map((c) => base(c.id)),
					base(rec.id),
				),
			);
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
	}

	for (const id of timed) {
		timeChecks.push((span) =>
			span(id)[0] < -TIME_EPSILON
				? `${id} starts at ${Math.round(span(id)[0] * 1000) / 1000}s, before the scene`
				: undefined,
		);
	}

	return {
		timeOperators: ops,
		timeSeed,
		timedIds: nodes.filter((n) => timed.has(n.id)).map((n) => n.id),
		timeChecks,
		warnings,
	};
}

/** Problems with a solved schedule: violated inequalities, off-beat starts, negative starts. */
export function checkTime(
	scene: { timeChecks?: readonly TimeCheck[] },
	layout: Record<string, { start?: number; duration?: number }>,
): string[] {
	const span = (id: string): [number, number] => [
		layout[id]?.start ?? 0,
		layout[id]?.duration ?? 0,
	];
	return (scene.timeChecks ?? [])
		.map((check) => check(span))
		.filter((w): w is string => w !== undefined);
}
