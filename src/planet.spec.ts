import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSceneFromJson } from "./parser";
import { solveLayout } from "./solver";

const examplePath = join(__dirname, "../examples/planet.json");
const data = JSON.parse(readFileSync(examplePath, "utf8"));
const scene = buildSceneFromJson(data);
const layout = solveLayout(scene, { damping: 1 });

function centerY(id: string) {
	const box = layout[id];
	return box.y + box.height / 2;
}

const EPS = 1e-6;
function bboxContains(container: string, child: string) {
	const c = layout[container];
	const b = layout[child];
	return (
		b.x + EPS >= c.x &&
		b.y + EPS >= c.y &&
		b.x + b.width <= c.x + c.width + EPS &&
		b.y + b.height <= c.y + c.height + EPS
	);
}

describe("planet example", () => {
	it("circles stay within stack and align", () => {
		const ids = ["mercury", "venus", "earth", "mars"] as const;
		for (const id of ids) {
			expect(bboxContains("planets", id)).toBe(true);
		}
		for (let i = 0; i < ids.length; i++) {
			for (let j = i + 1; j < ids.length; j++) {
				const a = layout[ids[i]];
				const b = layout[ids[j]];
				const ar = a.width / 2;
				const br = b.width / 2;
				const ax = a.x + ar;
				const ay = a.y + ar; // width==height for circles
				const bx = b.x + br;
				const by = b.y + br;
				const dist = Math.hypot(ax - bx, ay - by);
				expect(dist + EPS).toBeGreaterThanOrEqual(ar + br);
			}
		}
		const firstY = centerY(ids[0]);
		for (const id of ids.slice(1)) {
			expect(centerY(id)).toBeCloseTo(firstY);
		}
	});

	it("label aligns with mercury and sits outside stack", () => {
		const label = layout.label;
		const mercury = layout.mercury;
		expect(label.x + label.width / 2).toBeCloseTo(
			mercury.x + mercury.width / 2,
		);
		const stack = layout.planets;
		const overlaps = !(
			label.x + label.width <= stack.x ||
			label.x >= stack.x + stack.width ||
			label.y + label.height <= stack.y ||
			label.y >= stack.y + stack.height
		);
		expect(overlaps).toBe(false);
	});
});
