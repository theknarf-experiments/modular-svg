// Routes: the geometry a Travel follows, as a polyline measured by distance.
// Curves are flattened once, so everything after reads a route the same way.

export type Point = { x: number; y: number };

export type Route = {
	points: readonly Point[];
	/** distance along the route at each point */
	lengths: readonly number[];
	/** distance at each waypoint, the start included */
	marks: readonly number[];
	closed: boolean;
};

const FLATNESS = 0.1;
// Ends closer than this are the same place: the route loops
const MEETS = 0.5;
// A bend sharper than this between two runs is a corner, not a curve
const CORNER = 30;

const gap = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);

const mid = (a: Point, b: Point, u = 0.5): Point => ({
	x: a.x + (b.x - a.x) * u,
	y: a.y + (b.y - a.y) * u,
});

/** The points after `at(0)` that draw `at` over 0..1 within `flatness`. */
function flatten(at: (u: number) => Point, flatness: number): Point[] {
	const out: Point[] = [];
	const split = (
		u0: number,
		p0: Point,
		u1: number,
		p1: Point,
		depth: number,
	) => {
		const um = (u0 + u1) / 2;
		const pm = at(um);
		const flat =
			depth >= 2 &&
			[0.25, 0.5, 0.75].every((f) => {
				const p = f === 0.5 ? pm : at(u0 + (u1 - u0) * f);
				return gap(p, mid(p0, p1, f)) <= flatness;
			});
		if (flat || depth >= 12) {
			out.push(p1);
			return;
		}
		split(u0, p0, um, pm, depth + 1);
		split(um, pm, u1, p1, depth + 1);
	};
	split(0, at(0), 1, at(1), 0);
	return out;
}

const cubic =
	(p0: Point, p1: Point, p2: Point, p3: Point) =>
	(u: number): Point => {
		const v = 1 - u;
		const [a, b, c, d] = [v ** 3, 3 * v * v * u, 3 * v * u * u, u ** 3];
		return {
			x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
			y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
		};
	};

const ARITY: Record<string, number> = {
	M: 2,
	L: 2,
	H: 1,
	V: 1,
	C: 6,
	S: 4,
	Q: 4,
	T: 2,
	A: 7,
	Z: 0,
};

/**
 * The first subpath of path data as a polyline. Commands it cannot follow
 * are named in `unread`: an arc (`A`) is crossed in a straight line, and
 * later subpaths are left out.
 */
export function flattenPath(
	d: string,
	flatness = FLATNESS,
): { points: Point[]; closed: boolean; unread: string[] } {
	const tokens =
		d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
	const points: Point[] = [];
	const unread: string[] = [];
	let closed = false;
	let at: Point = { x: 0, y: 0 };
	let start = at;
	// The last control point, which S and T mirror
	let control: { kind: "C" | "Q"; point: Point } | undefined;
	let i = 0;
	let command = "";
	const note = (what: string) => {
		if (!unread.includes(what)) unread.push(what);
	};
	while (i < tokens.length) {
		if (/[a-zA-Z]/.test(tokens[i])) command = tokens[i++];
		else if (command === "M") command = "L";
		else if (command === "m") command = "l";
		const kind = command.toUpperCase();
		const arity = ARITY[kind];
		if (arity === undefined || i + arity > tokens.length) break;
		const relative = command !== kind;
		const n = tokens.slice(i, i + arity).map(Number);
		i += arity;
		const to = (x: number, y: number): Point =>
			relative ? { x: at.x + x, y: at.y + y } : { x, y };
		if (kind === "M") {
			if (points.length > 0) {
				note("M");
				break;
			}
			at = to(n[0], n[1]);
			start = at;
			points.push(at);
			control = undefined;
			continue;
		}
		if (points.length === 0) points.push(at);
		let next = control;
		control = undefined;
		if (kind === "Z") {
			if (gap(at, start) > 1e-9) points.push(start);
			at = start;
			closed = true;
			if (i < tokens.length) note("M");
			break;
		}
		let end: Point;
		if (kind === "L" || kind === "A") {
			end = kind === "A" ? to(n[5], n[6]) : to(n[0], n[1]);
			if (kind === "A") note("A");
			points.push(end);
		} else if (kind === "H") {
			end = { x: relative ? at.x + n[0] : n[0], y: at.y };
			points.push(end);
		} else if (kind === "V") {
			end = { x: at.x, y: relative ? at.y + n[0] : n[0] };
			points.push(end);
		} else if (kind === "C" || kind === "S") {
			const c1 =
				kind === "C"
					? to(n[0], n[1])
					: next?.kind === "C"
						? mid(next.point, at, 2)
						: at;
			const rest = kind === "C" ? n.slice(2) : n;
			const c2 = to(rest[0], rest[1]);
			end = to(rest[2], rest[3]);
			points.push(...flatten(cubic(at, c1, c2, end), flatness));
			next = { kind: "C", point: c2 };
			control = next;
		} else {
			const c =
				kind === "Q"
					? to(n[0], n[1])
					: next?.kind === "Q"
						? mid(next.point, at, 2)
						: at;
			end = kind === "Q" ? to(n[2], n[3]) : to(n[0], n[1]);
			// A quadratic is the cubic whose controls sit two thirds of the way to its own
			points.push(
				...flatten(
					cubic(at, mid(at, c, 2 / 3), mid(end, c, 2 / 3), end),
					flatness,
				),
			);
			control = { kind: "Q", point: c };
		}
		at = end;
	}
	return { points, closed, unread };
}

/**
 * One smooth curve through the points (centripetal Catmull-Rom), as a
 * polyline with the distance at which it passes each of them. It loops when
 * the last point meets the first.
 */
export function smoothThrough(
	points: readonly Point[],
	flatness = FLATNESS,
): { points: Point[]; marks: number[]; closed: boolean } {
	const n = points.length;
	if (n === 0) return { points: [], marks: [], closed: false };
	const closed = n > 3 && gap(points[0], points[n - 1]) <= MEETS;
	// Around a loop the neighbours wrap; at an open end the end stands in twice
	const p = (i: number): Point => {
		if (!closed) return points[Math.min(n - 1, Math.max(0, i))];
		const ring = n - 1;
		return points[((i % ring) + ring) % ring];
	};
	const out: Point[] = [points[0]];
	const marks = [0];
	let length = 0;
	for (let i = 0; i + 1 < n; i++) {
		const [p0, p1, p2, p3] = [p(i - 1), p(i), points[i + 1], p(i + 2)];
		const t1 = Math.sqrt(gap(p0, p1));
		const t2 = t1 + Math.sqrt(gap(p1, p2));
		const t3 = t2 + Math.sqrt(gap(p2, p3));
		const mix = (a: Point, b: Point, ta: number, tb: number, t: number) =>
			tb - ta < 1e-12 ? a : mid(a, b, (t - ta) / (tb - ta));
		const at = (u: number): Point => {
			const t = t1 + (t2 - t1) * u;
			const a1 = mix(p0, p1, 0, t1, t);
			const a2 = mix(p1, p2, t1, t2, t);
			const a3 = mix(p2, p3, t2, t3, t);
			return mix(mix(a1, a2, 0, t2, t), mix(a2, a3, t1, t3, t), t1, t2, t);
		};
		const run = t2 - t1 < 1e-12 ? [] : flatten(at, flatness);
		if (run.length > 0) run[run.length - 1] = p2;
		for (const q of run) {
			length += gap(out[out.length - 1], q);
			out.push(q);
		}
		marks.push(length);
	}
	return { points: out, marks, closed };
}

/** Points along a circle's arc; angles in degrees, 0 at the top, clockwise. */
export function arcPoints(
	cx: number,
	cy: number,
	r: number,
	startAngle: number,
	endAngle: number,
	flatness = FLATNESS,
): Point[] {
	const sweep = ((endAngle - startAngle) * Math.PI) / 180;
	const step = r > flatness ? 2 * Math.acos(1 - flatness / r) : Math.PI / 2;
	const count = Math.max(1, Math.ceil(Math.abs(sweep) / step));
	return Array.from({ length: count + 1 }, (_, i) => {
		const rad = ((startAngle - 90) * Math.PI) / 180 + (sweep * i) / count;
		return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
	});
}

/** A polyline measured by distance. Without `marks` its two ends are the waypoints. */
export function routeOf(
	points: readonly Point[],
	marks?: readonly number[],
	closed = false,
): Route {
	const lengths: number[] = [];
	let length = 0;
	points.forEach((p, i) => {
		if (i > 0) length += gap(points[i - 1], p);
		lengths.push(length);
	});
	return { points, lengths, marks: marks ?? [0, length], closed };
}

const degrees = (a: Point, b: Point): number =>
	(Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;

/** `angle` moved by whole turns to within half a turn of `near`. */
export const nearestTurn = (angle: number, near: number): number =>
	angle - 360 * Math.round((angle - near) / 360);

/**
 * The point and heading (degrees, 0 along +x) at distance s. Past an end the
 * route runs on along its tangent, or wraps when closed. The heading turns
 * evenly through a curve's flattened runs and snaps at a corner.
 */
export function along(route: Route, s: number): Point & { angle: number } {
	const { points, lengths } = route;
	const last = points.length - 1;
	if (last < 0) return { x: 0, y: 0, angle: 0 };
	const total = lengths[last];
	if (!(total > 0)) return { ...points[0], angle: 0 };
	if (route.closed && (s < 0 || s > total)) s = ((s % total) + total) % total;
	let lo = 0;
	let hi = last - 1;
	while (lo < hi) {
		const m = (lo + hi + 1) >> 1;
		if (lengths[m] <= s) lo = m;
		else hi = m - 1;
	}
	// Runs of no length have no heading; step over them
	const run = (i: number, step: number): number | undefined => {
		for (let j = i; j >= 0 && j < last; j += step)
			if (lengths[j + 1] > lengths[j]) return j;
		if (!route.closed) return undefined;
		for (
			let j = step > 0 ? 0 : last - 1;
			j !== i && j >= 0 && j < last;
			j += step
		)
			if (lengths[j + 1] > lengths[j]) return j;
		return undefined;
	};
	const i = run(lo, 1) ?? run(lo, -1) ?? lo;
	const [a, b] = [points[i], points[i + 1]];
	const u = (s - lengths[i]) / (lengths[i + 1] - lengths[i]);
	const own = degrees(a, b);
	// Where this run meets a neighbour in a gentle bend, both give way half
	const toward = (j: number | undefined): number => {
		if (j === undefined || j === i) return own;
		const other = nearestTurn(degrees(points[j], points[j + 1]), own);
		return Math.abs(other - own) > CORNER ? own : (own + other) / 2;
	};
	const [prev, next] = [run(i - 1, -1), run(i + 1, 1)];
	// The first and last run of a curve have one neighbour: they turn as much
	// towards their open end as away from it, which is the curve's tangent there
	const before = prev === undefined ? 2 * own - toward(next) : toward(prev);
	const after = next === undefined ? 2 * own - toward(prev) : toward(next);
	const within = Math.min(1, Math.max(0, u));
	return {
		x: a.x + (b.x - a.x) * u,
		y: a.y + (b.y - a.y) * u,
		angle: before + (after - before) * within,
	};
}
