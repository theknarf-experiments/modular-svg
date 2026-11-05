/** A solved time span, in seconds. */
export type Span = { start: number; duration: number };

export type Cue = { id: string; edge: "start" | "end"; at: number };

/**
 * Cues whose time falls in (from, to] on the unwrapped clock. A looping
 * scene repeats every cue each pass. A backwards jump (scrubbing) fires
 * nothing.
 */
export function cuesBetween(
	solution: { spans: Record<string, Span>; duration: number; loop: boolean },
	keys: readonly string[],
	from: number,
	to: number,
): Cue[] {
	// Compare on a nanosecond grid, so float noise cannot make a cue fire in
	// one pass of a loop and not the next, or twice across a frame boundary
	const q = (t: number) => Math.round(t * 1e9);
	const [lo, hi] = [q(from), q(to)];
	if (!(hi > lo)) return [];
	const fires = (t: number) => q(t) > lo && q(t) <= hi;
	const found: Cue[] = [];
	for (const key of keys) {
		const [id, suffix] = key.split(":");
		const span = solution.spans[id];
		if (!span) continue;
		const edge = suffix === "end" ? "end" : "start";
		const at = edge === "end" ? span.start + span.duration : span.start;
		const period = solution.duration;
		if (solution.loop && period > 0) {
			// Pass k plays this cue at at + k * period
			const first = Math.max(0, Math.floor((from - at) / period));
			for (let k = first; at + k * period <= to + 1e-6; k++)
				if (fires(at + k * period))
					found.push({ id, edge, at: at + k * period });
		} else if (fires(at)) found.push({ id, edge, at });
	}
	return found.sort((a, b) => a.at - b.at);
}
