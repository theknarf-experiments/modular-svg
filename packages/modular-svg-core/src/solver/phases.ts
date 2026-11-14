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
 * A solved phase: the boxes it leaves anywhere but home, by slot base. Only
 * those are kept, so a phase costs what it moves, not the size of the scene.
 */
export type Phase = ReadonlyMap<number, Float64Array>;

/**
 * The solved layout after every event, by event id. A phase depends only on
 * its active modulations, so each distinct list is solved once; none active
 * is home itself.
 */
export function solvePhases(
	phaseOperators: PhaseOperators,
	clocks: readonly ClockPhases[],
	solve: (operators: readonly LayoutOperator[]) => Phase,
): Map<string, Phase> {
	const solved = new Map<string, Phase>([["", new Map()]]);
	const phases = new Map<string, Phase>();
	for (const { events } of clocks) {
		for (const e of events) {
			const key = e.active.join("\n");
			let phase = solved.get(key);
			if (!phase) {
				phase = solve(phaseOperators(e.active).operators);
				solved.set(key, phase);
			}
			phases.set(e.id, phase);
		}
	}
	return phases;
}

/**
 * Solve one phase on `state`, which holds home on entry and again on return
 * (as does `mirror`, relax's copy of it): only the slots the phase's
 * relations write are compared and put back, never the whole scene.
 */
export function solvePhase(
	operators: readonly LayoutOperator[],
	home: Float64Array,
	state: Float64Array,
	mirror: Float64Array,
	relax: (state: Float64Array, mirror: Float64Array) => void,
): Phase {
	relax(state, mirror);
	const away = new Map<number, Float64Array>();
	const visit = (each: (slot: number) => void): void => {
		if (operators.some((op) => !op.writes))
			for (let i = 0; i < home.length; i++) each(i);
		else for (const op of operators) for (const i of op.writes ?? []) each(i);
	};
	visit((i) => {
		const base = i - (i % 4);
		if (state[i] !== home[i] && !away.has(base))
			away.set(base, state.slice(base, base + 4));
	});
	visit((i) => {
		state[i] = home[i];
		mirror[i] = home[i];
	});
	// In slot order, whatever order the relations wrote them in
	return new Map([...away].sort(([a], [b]) => a - b));
}

/**
 * Per node, the box it takes after each event that moves it. Each clock is
 * followed on its own: a box is recorded when it differs from the one before
 * it in that clock. An event only looks at the nodes its phase puts away from
 * home and those still shown away from it, not at the whole scene.
 */
export function phaseMoves(
	home: Float64Array,
	clocks: readonly ClockPhases[],
	phases: ReadonlyMap<string, Phase>,
): (Record<string, LayoutBox> | undefined)[] {
	const moves: (Record<string, LayoutBox> | undefined)[] = new Array(
		home.length / 4,
	).fill(undefined);
	for (const { events } of clocks) {
		// What the clock shows away from home
		const shown = new Map<number, Float64Array>();
		for (const e of events) {
			const phase = phases.get(e.id);
			if (!phase) continue;
			for (const base of new Set([...shown.keys(), ...phase.keys()])) {
				const at = home.subarray(base, base + 4);
				const [to, from] = [phase.get(base) ?? at, shown.get(base) ?? at];
				// Back home means exactly home, not within a rounding of it
				const moved = to.some((v, k) =>
					phase.size === 0 ? v !== from[k] : !(Math.abs(v - from[k]) <= MOVED),
				);
				if (!moved) continue;
				if (to.every((v, k) => v === at[k])) shown.delete(base);
				else shown.set(base, to);
				const record = moves[base / 4] ?? {};
				record[e.id] = { x: to[0], y: to[1], width: to[2], height: to[3] };
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
