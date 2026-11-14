// Layout in time: a Modulate changes which relations hold from its start on,
// a Resolve lets them go. Each distinct set of active modulations is a phase,
// solved once from the home layout; what moves between two phases is tweened.

import type { LayoutOperator, NodeRecord } from "./operators.ts";

export type LayoutBox = { x: number; y: number; width: number; height: number };

export type PhaseEvent = {
	/** the Modulate or Resolve */
	id: string;
	/** in the time of the clock it plays in */
	start: number;
	/** how long the layout takes to get there; cut short by the next event */
	over: number;
	/** the modulations that hold from here on, in the order they started */
	active: string[];
};

export type ClockPhases = {
	/** the phrase these events play in; undefined for scene time */
	clock: string | undefined;
	events: PhaseEvent[];
};

export type PhaseOperators = (active: readonly string[]) => {
	operators: LayoutOperator[];
	names: string[];
};

/** A box's change from the phase before must exceed this to count as a move. */
const MOVED = 1e-3;

/**
 * The changes of layout in each clock, in the order they start (ties in
 * document order), each with the modulations active after it.
 */
export function foldPhases(
	nodes: readonly NodeRecord[],
	spanOf: (id: string) => { start: number; duration: number } | undefined,
): ClockPhases[] {
	const byClock = new Map<
		string | undefined,
		{ node: NodeRecord; start: number; duration: number }[]
	>();
	for (const node of nodes) {
		const span = node.modulation && spanOf(node.id);
		if (!span) continue;
		const list = byClock.get(node.clock);
		if (list) list.push({ node, ...span });
		else byClock.set(node.clock, [{ node, ...span }]);
	}
	return [...byClock].map(([clock, list]) => {
		// Array sort is stable, so equal starts keep document order
		const sorted = [...list].sort((a, b) => a.start - b.start);
		let active: string[] = [];
		const events = sorted.map(({ node, start, duration }, i) => {
			const m = node.modulation;
			if (m?.kind === "modulate")
				active = [...active.filter((id) => id !== node.id), node.id];
			else if (m && m.releases.length > 0)
				active = active.filter((id) => !m.releases.includes(id));
			else active = [];
			const next = sorted[i + 1];
			// Rounded like the spans it comes from, which feed keyframe percentages
			const until = next ? Math.min(duration, next.start - start) : duration;
			const over = Math.max(0, Math.round(until * 1e6) / 1e6);
			return { id: node.id, start, over, active };
		});
		return { clock, events };
	});
}

/**
 * The solved layout after every event, by event id. A phase depends only on
 * its active modulations, so each distinct list is solved once; none active
 * is home itself.
 */
export function solvePhases(
	phaseOperators: PhaseOperators,
	home: Float64Array,
	clocks: readonly ClockPhases[],
	solve: (operators: readonly LayoutOperator[]) => Float64Array,
): Map<string, Float64Array> {
	const solved = new Map<string, Float64Array>([["", home]]);
	const states = new Map<string, Float64Array>();
	for (const { events } of clocks) {
		for (const e of events) {
			const key = e.active.join("\n");
			const known = solved.get(key);
			const state = known ?? solve(phaseOperators(e.active).operators);
			if (!known) solved.set(key, state);
			states.set(e.id, state);
		}
	}
	return states;
}

/**
 * Per node, the box it takes after each event that moves it. Each clock is
 * followed on its own: a box is recorded when it differs from the one before
 * it in that clock.
 */
export function phaseMoves(
	home: Float64Array,
	clocks: readonly ClockPhases[],
	states: ReadonlyMap<string, Float64Array>,
): (Record<string, LayoutBox> | undefined)[] {
	const moves: (Record<string, LayoutBox> | undefined)[] = new Array(
		home.length / 4,
	).fill(undefined);
	for (const { events } of clocks) {
		const shown = new Float64Array(home);
		for (const e of events) {
			const state = states.get(e.id);
			if (!state) continue;
			for (let base = 0; base < home.length; base += 4) {
				// Back home means exactly home, not within a rounding of it
				let moved = false;
				for (let k = 0; k < 4; k++) {
					const [to, from] = [state[base + k], shown[base + k]];
					if (state === home ? to !== from : !(Math.abs(to - from) <= MOVED))
						moved = true;
				}
				if (!moved) continue;
				shown.set(state.subarray(base, base + 4), base);
				const record = moves[base / 4] ?? {};
				record[e.id] = {
					x: state[base],
					y: state[base + 1],
					width: state[base + 2],
					height: state[base + 3],
				};
				moves[base / 4] = record;
			}
		}
	}
	return moves;
}

/** A node's box after each of a clock's events: the last move it made, else home. */
export function phaseBoxes(
	box: LayoutBox & { phases?: Record<string, LayoutBox> },
	events: readonly { id: string }[],
): LayoutBox[] {
	let current: LayoutBox = box;
	return events.map((e) => {
		current = box.phases?.[e.id] ?? current;
		return current;
	});
}

export const lerpBoxes = (
	a: LayoutBox,
	b: LayoutBox,
	p: number,
): LayoutBox => ({
	x: a.x + (b.x - a.x) * p,
	y: a.y + (b.y - a.y) * p,
	width: a.width + (b.width - a.width) * p,
	height: a.height + (b.height - a.height) * p,
});
