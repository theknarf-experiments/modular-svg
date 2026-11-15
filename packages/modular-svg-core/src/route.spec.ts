import { describe, expect, it } from "vitest";
import {
	along,
	arcPoints,
	flattenPath,
	routeOf,
	smoothThrough,
} from "./route.ts";

const near = (a: { x: number; y: number }, b: { x: number; y: number }) =>
	Math.hypot(a.x - b.x, a.y - b.y);

describe("flattenPath", () => {
	it("reads straight commands, absolute and relative", () => {
		const { points, closed, unread } = flattenPath(
			"M 10 10 L 30 10 h 10 V 30 v 10 l -30 0 Z",
		);
		expect(points).toEqual([
			{ x: 10, y: 10 },
			{ x: 30, y: 10 },
			{ x: 40, y: 10 },
			{ x: 40, y: 30 },
			{ x: 40, y: 40 },
			{ x: 10, y: 40 },
			{ x: 10, y: 10 },
		]);
		expect(closed).toBe(true);
		expect(unread).toEqual([]);
	});

	it("flattens a cubic to within the flatness", () => {
		const { points } = flattenPath("M 0 0 C 0 100 100 100 100 0");
		expect(points[0]).toEqual({ x: 0, y: 0 });
		expect(points[points.length - 1]).toEqual({ x: 100, y: 0 });
		// The curve's top is at y = 75
		expect(Math.max(...points.map((p) => p.y))).toBeCloseTo(75, 0);
		expect(points.length).toBeGreaterThan(8);
		expect(points.length).toBeLessThan(80);
	});

	it("reads Q, and S and T as the mirror of the control before", () => {
		const q = flattenPath("M 0 0 Q 50 100 100 0 T 200 0").points;
		expect(q.some((p) => near(p, { x: 50, y: 50 }) < 0.5)).toBe(true);
		// T mirrors the control to (150, -100)
		expect(q.some((p) => near(p, { x: 150, y: -50 }) < 0.5)).toBe(true);
		const s = flattenPath("M 0 0 C 0 50 50 50 50 0 s 50 -50 50 0").points;
		// S mirrors (50, 50) to (50, -50): the curve dips above the line
		expect(Math.min(...s.map((p) => p.y))).toBeLessThan(-30);
		expect(s[s.length - 1]).toEqual({ x: 100, y: 0 });
	});

	it("names what it cannot follow", () => {
		const arc = flattenPath("M 0 0 A 10 10 0 0 1 20 0 L 40 0");
		expect(arc.unread).toEqual(["A"]);
		expect(arc.points).toEqual([
			{ x: 0, y: 0 },
			{ x: 20, y: 0 },
			{ x: 40, y: 0 },
		]);
		const two = flattenPath("M 0 0 L 10 0 M 20 0 L 30 0");
		expect(two.unread).toEqual(["M"]);
		expect(two.points).toHaveLength(2);
	});
});

describe("smoothThrough", () => {
	const waypoints = [
		{ x: 0, y: 0 },
		{ x: 100, y: 40 },
		{ x: 160, y: -30 },
		{ x: 260, y: 10 },
	];

	it("passes through every waypoint, at its mark", () => {
		const { points, marks, closed } = smoothThrough(waypoints);
		const route = routeOf(points, marks, closed);
		expect(closed).toBe(false);
		expect(marks).toHaveLength(waypoints.length);
		waypoints.forEach((w, i) => {
			expect(near(along(route, marks[i]), w)).toBeLessThan(1e-6);
		});
		// A curve, so longer than the straight legs
		expect(marks[3]).toBeGreaterThan(
			near(waypoints[0], waypoints[1]) +
				near(waypoints[1], waypoints[2]) +
				near(waypoints[2], waypoints[3]),
		);
	});

	it("closes when the ends meet, with one heading across the seam", () => {
		const loop = [
			{ x: 0, y: 0 },
			{ x: 120, y: -20 },
			{ x: 150, y: 80 },
			{ x: 20, y: 110 },
			{ x: 0.2, y: 0.1 },
		];
		const { points, marks, closed } = smoothThrough(loop);
		expect(closed).toBe(true);
		const route = routeOf(points, marks, closed);
		const total = marks[marks.length - 1];
		const [a, b] = [along(route, 0.01), along(route, total - 0.01)];
		expect(Math.abs(((a.angle - b.angle + 540) % 360) - 180)).toBeLessThan(8);
	});
});

describe("along", () => {
	const route = routeOf([
		{ x: 0, y: 0 },
		{ x: 100, y: 0 },
		{ x: 100, y: 50 },
	]);

	it("moves evenly by distance", () => {
		expect(along(route, 25)).toMatchObject({ x: 25, y: 0, angle: 0 });
		expect(along(route, 125)).toMatchObject({ x: 100, y: 25, angle: 90 });
	});

	it("runs on along the tangent past an open end", () => {
		expect(along(route, -10)).toMatchObject({ x: -10, y: 0, angle: 0 });
		expect(along(route, 160)).toMatchObject({ x: 100, y: 60, angle: 90 });
	});

	it("wraps when closed", () => {
		const square = routeOf(
			[
				{ x: 0, y: 0 },
				{ x: 10, y: 0 },
				{ x: 10, y: 10 },
				{ x: 0, y: 10 },
				{ x: 0, y: 0 },
			],
			undefined,
			true,
		);
		expect(along(square, 45)).toMatchObject({ x: 5, y: 0 });
		expect(along(square, -5)).toMatchObject({ x: 0, y: 5 });
		expect(along(square, 40)).toMatchObject({ x: 0, y: 0 });
	});

	it("turns evenly through a flattened curve", () => {
		const circle = routeOf(arcPoints(0, 0, 100, 0, 360), undefined, true);
		const total = circle.lengths[circle.lengths.length - 1];
		for (const f of [0.1, 0.37, 0.5, 0.93]) {
			const { angle } = along(circle, total * f);
			// Clockwise from the top: heading starts along +x
			expect(Math.abs(((angle - 360 * f + 540) % 360) - 180)).toBeLessThan(0.5);
		}
	});
	it("heads along the tangent at both ends of an open curve", () => {
		for (const r of [12, 80]) {
			const half = routeOf(arcPoints(30, 30, r, 0, 180));
			const total = half.lengths[half.lengths.length - 1];
			expect(Math.abs(along(half, 0).angle)).toBeLessThan(0.1);
			expect(Math.abs(along(half, total).angle - 180)).toBeLessThan(0.1);
			expect(Math.abs(along(half, total / 2).angle - 90)).toBeLessThan(0.1);
		}
		// Straight to a corner: the first leg's own direction
		const bent = routeOf([
			{ x: 0, y: 0 },
			{ x: 50, y: 0 },
			{ x: 50, y: 50 },
		]);
		expect(along(bent, 0).angle).toBe(0);
		expect(along(bent, 100).angle).toBe(90);
	});
});

describe("arcPoints", () => {
	it("starts at the top and runs clockwise", () => {
		const points = arcPoints(50, 50, 20, 0, 90);
		expect(near(points[0], { x: 50, y: 30 })).toBeLessThan(1e-9);
		expect(near(points[points.length - 1], { x: 70, y: 50 })).toBeLessThan(
			1e-9,
		);
		for (const p of points)
			expect(Math.hypot(p.x - 50, p.y - 50)).toBeCloseTo(20, 9);
	});
});
