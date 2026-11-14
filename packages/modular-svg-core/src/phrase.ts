// A phrase is a clock: what it takes plays in the phrase's own seconds, and
// the phrase maps that onto the time around it, pass by pass. Retiming works
// on expanded steps, so stretching a phrase scales its tape speed.

import type { Span } from "./cues.ts";
import {
	CHANNELS,
	type Channel,
	type Expanded,
	MAX_PASSES,
	type ResolvedEase,
	type Step,
	type Values,
} from "./motion.ts";

export type Clock = {
	/** where the phrase starts, in the time around it */
	start: number;
	/** how long all its passes take, in the time around it */
	span: number;
	/** how long one pass is in its own seconds */
	length: number;
	/** passes; Infinity repeats until the time around it ends (span is then one pass) */
	repeat: number;
	alternate: boolean;
	retrograde: boolean;
};

const HOLD: ResolvedEase = { kind: "steps", count: 1 };

const passOf = (c: Clock): number =>
	Number.isFinite(c.repeat) ? c.span / c.repeat : c.span;

export const backwards = (c: Clock, pass: number): boolean =>
	c.retrograde !== (c.alternate && pass % 2 === 1);

/** Where a span in the phrase's own time lands on its first pass. */
export function imageOf(c: Clock, span: Span): Span {
	const k = c.length > 0 ? passOf(c) / c.length : 0;
	const local = backwards(c, 0)
		? c.length - span.start - span.duration
		: span.start;
	return { start: c.start + local * k, duration: span.duration * k };
}

/** The ease that plays `e` backwards: at x it has 1 - e(1 - x) left to go. */
export function reverseEase(e: ResolvedEase): ResolvedEase {
	if (e.kind === "linear") return e;
	if (e.kind === "steps")
		return e.jump ? { kind: "steps", count: e.count } : { ...e, jump: "start" };
	const [x1, y1, x2, y2] = e.points;
	return { kind: "bezier", points: [1 - x2, 1 - y2, 1 - x1, 1 - y1] };
}

/**
 * Steps in a phrase's own time, as they play in the time around it: every
 * pass, forwards or backwards. `rest` gives a channel's value when nothing
 * has set it, which a backward pass needs to know where it ends. Passes that
 * repeat forever stop at `until`.
 */
export function retime(
	e: Expanded,
	c: Clock,
	until: number,
	rest: (channel: Channel) => number | string,
): Expanded {
	const pass = passOf(c);
	if (!(pass > 0) || !(c.length > 0)) return { initial: e.initial, steps: [] };
	const forever = !Number.isFinite(c.repeat);
	const passes = forever
		? Math.ceil((until - c.start) / pass - 1e-9)
		: c.repeat;
	if (!(passes <= MAX_PASSES))
		throw new Error(
			`A phrase would repeat ${passes} times (${pass}s a pass until ${until}s); the cap is ${MAX_PASSES}`,
		);
	const k = pass / c.length;
	const ordered = [...e.steps].sort((a, b) => a.start - b.start);

	// The state at both ends and before every step, with nothing left implicit
	let ends: { first: Values; last: Values; before: Values[] } | undefined;
	const states = () => {
		if (ends) return ends;
		const channels = [
			...new Set([
				...Object.keys(e.initial),
				...ordered.flatMap((s) => Object.keys(s.values)),
			]),
		] as Channel[];
		const first: Values = Object.fromEntries(
			channels.map((ch) => [
				ch,
				e.initial[ch] ?? CHANNELS[ch].identity ?? rest(ch),
			]),
		);
		let state = first;
		const before = ordered.map((s) => {
			const was = Object.fromEntries(
				Object.keys(s.values).map((ch) => [ch, state[ch as Channel]]),
			);
			state = { ...state, ...s.values };
			return was;
		});
		ends = { first, last: state, before };
		return ends;
	};

	const steps: Step[] = [];
	const play = (s: Step): void => {
		if (!forever) steps.push(s);
		else if (s.start < until - 1e-9)
			steps.push({ ...s, over: Math.min(s.over, until - s.start) });
	};
	for (let j = 0; j < passes; j++) {
		const origin = c.start + j * pass;
		const back = backwards(c, j);
		// Two passes the same way jump back to where a pass begins; a turn does not
		if (j > 0 && back === backwards(c, j - 1))
			play({
				start: origin,
				over: 0,
				ease: HOLD,
				values: back ? states().last : states().first,
			});
		if (!back) {
			for (const s of ordered)
				play({ ...s, start: origin + s.start * k, over: s.over * k });
			continue;
		}
		const { before } = states();
		for (let i = ordered.length - 1; i >= 0; i--) {
			const s = ordered[i];
			play({
				start: origin + (c.length - s.start - s.over) * k,
				over: s.over * k,
				ease: s.over > 0 ? reverseEase(s.ease) : s.ease,
				values: before[i],
			});
		}
	}
	return { initial: backwards(c, 0) ? states().last : e.initial, steps };
}
