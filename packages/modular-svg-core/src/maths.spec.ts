import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { unionBoundingBox2d } from "./math";

describe("unionBoundingBox2d", () => {
	const boxArb = fc
		.tuple(
			fc.integer({ min: -50, max: 50 }),
			fc.integer({ min: -50, max: 50 }),
			fc.integer({ min: -50, max: 50 }),
			fc.integer({ min: -50, max: 50 }),
		)
		.map(([x1, y1, x2, y2]) => ({
			start: { x: Math.min(x1, x2), y: Math.min(y1, y2) },
			end: { x: Math.max(x1, x2), y: Math.max(y1, y2) },
		}));

	it("encapsulates both boxes", () => {
		fc.assert(
			fc.property(boxArb, boxArb, (a, b) => {
				const combined = unionBoundingBox2d(a, b);
				const expected = {
					start: {
						x: Math.min(a.start.x, b.start.x),
						y: Math.min(a.start.y, b.start.y),
					},
					end: {
						x: Math.max(a.end.x, b.end.x),
						y: Math.max(a.end.y, b.end.y),
					},
				};
				expect(combined).toStrictEqual(expected);
			}),
		);
	});
});
