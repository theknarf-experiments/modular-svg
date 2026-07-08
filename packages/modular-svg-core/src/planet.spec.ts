import { describe, expect, it } from "vitest";
import {
	Align,
	Arrow,
	Background,
	Bluefish,
	Circle,
	Distribute,
	Ref,
	StackH,
	Text,
} from "./builder.ts";
import { layoutToSvg } from "./output.ts";
import { buildSceneFromJson } from "./parser.ts";
import { solveLayout } from "./solver/index.ts";

const scene = buildSceneFromJson(
	Bluefish(
		Background(
			{ padding: 10 },
			StackH(
				{ name: "planets", spacing: 50, alignment: "centerY" },
				Circle({
					name: "mercury",
					r: 15,
					fill: "#EBE3CF",
					"stroke-width": 3,
					stroke: "black",
				}),
				Circle({
					name: "venus",
					r: 36,
					fill: "#DC933C",
					"stroke-width": 3,
					stroke: "black",
				}),
				Circle({
					name: "earth",
					r: 38,
					fill: "#179DD7",
					"stroke-width": 3,
					stroke: "black",
				}),
				Circle({
					name: "mars",
					r: 21,
					fill: "#F1CF8E",
					"stroke-width": 3,
					stroke: "black",
				}),
			),
		),
		Align(
			{ alignment: "centerX" },
			Text({ name: "label" }, "Mercury"),
			Ref({ select: "mercury" }),
		),
		Distribute(
			{ direction: "vertical", spacing: 60 },
			Ref({ select: "label" }),
			Ref({ select: "mercury" }),
		),
		Arrow(Ref({ select: "label" }), Ref({ select: "mercury" })),
	),
);
const layout = solveLayout(scene, { damping: 1 });
const arrowId = scene.nodes.find((n) => n.type === "arrow")?.id ?? "arrow";

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

	it("label aligns with mercury", () => {
		const label = layout.label;
		const mercury = layout.mercury;
		expect(label.x + label.width / 2).toBeCloseTo(
			mercury.x + mercury.width / 2,
		);
	});

	it("arrow curves from the label to above mercury", () => {
		const label = layout.label;
		const mercury = layout.mercury;
		// compute arrow endpoints from the quadratic path in the svg output
		const svg = layoutToSvg(layout, scene.nodes);
		const pathMatch = new RegExp(`<path id="${arrowId}"[^>]+>`).exec(svg);
		expect(pathMatch).not.toBeNull();
		if (pathMatch) {
			const attrs = pathMatch[0];
			const d = /d="M([^,]+),([^ ]+) Q[^ ]+ ([^,]+),([^"]+)"/.exec(attrs);
			expect(d).not.toBeNull();
			if (d) {
				const [, , sy, , ey] = d.map(Number);
				const min = Math.min(...Object.values(layout).map((b) => b.y));
				const dy = -min;
				// starts at or below the label, ends above mercury's top edge
				expect(sy).toBeGreaterThan(label.y + dy);
				expect(ey).toBeLessThan(mercury.y + dy);
			}
			expect(attrs).toContain('stroke-width="3"');
		}
		expect(svg).toContain("<polygon");
	});
});
