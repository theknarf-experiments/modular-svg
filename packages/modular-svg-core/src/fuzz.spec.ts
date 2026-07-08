import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { layoutToSvg } from "./output.ts";
import { buildSceneFromJson, validate } from "./parser.ts";
import type { LayoutResult } from "./solver/index.ts";
import { solveLayout } from "./solver/index.ts";

// The solver is a damped fixed-point iteration (epsilon 1e-6, damping 0.5),
// so geometric assertions need a tolerance well above the termination
// threshold but far below any visible difference.
const EPS = 1e-3;

function close(a: number, b: number, eps = EPS): boolean {
	return Math.abs(a - b) <= eps;
}

function solveJson(json: Record<string, unknown>): {
	layout: LayoutResult;
	scene: ReturnType<typeof buildSceneFromJson>;
} {
	const scene = buildSceneFromJson(json);
	return { layout: solveLayout(scene), scene };
}

// ---------------------------------------------------------------------------
// Arbitraries: JSON scene fragments, fed through the full public pipeline
// (validate -> buildSceneFromJson -> solveLayout -> layoutToSvg).
// ---------------------------------------------------------------------------

const sizeArb = fc.integer({ min: 1, max: 200 });
const posArb = fc.integer({ min: -100, max: 100 });
const spacingArb = fc.integer({ min: 0, max: 50 });
const radiusArb = fc.integer({ min: 1, max: 80 });
const textArb = fc.string({ minLength: 0, maxLength: 12 });

const rectArb = fc
	.record({ width: sizeArb, height: sizeArb, x: posArb, y: posArb })
	.map((props) => ({ type: "Rect", props }));

const circleArb = fc
	.record({ r: radiusArb })
	.map((props) => ({ type: "Circle", props }));

const textNodeArb = fc
	.record({ text: textArb })
	.map((props) => ({ type: "Text", props }));

const leafArb = fc.oneof(rectArb, circleArb, textNodeArb);

type JsonNode = Record<string, unknown>;

function withIds(leaves: JsonNode[]): JsonNode[] {
	return leaves.map((leaf, i) => ({ ...leaf, id: `leaf${i}` }));
}

const stackSceneArb = fc.record({
	horizontal: fc.boolean(),
	spacing: spacingArb,
	alignmentIndex: fc.integer({ min: 0, max: 2 }),
	leaves: fc.array(leafArb, { minLength: 1, maxLength: 6 }),
});

const alignSceneArb = fc.record({
	axis: fc.constantFrom("x", "y"),
	alignment: fc.integer({ min: 0, max: 2 }),
	rects: fc.array(
		fc.record({ width: sizeArb, height: sizeArb, x: posArb, y: posArb }),
		{ minLength: 2, maxLength: 6 },
	),
});

const distributeSceneArb = fc.record({
	axis: fc.constantFrom("x", "y"),
	spacing: fc.integer({ min: 1, max: 50 }),
	rects: fc.array(
		fc.record({ width: sizeArb, height: sizeArb, x: posArb, y: posArb }),
		{ minLength: 2, maxLength: 6 },
	),
});

// Recursive scene: nested stacks / backgrounds / groups over leaves.
const { tree: nestedNodeArb } = fc.letrec((tie) => ({
	tree: fc.oneof(
		{ depthSize: "small", withCrossShrink: true },
		{ arbitrary: leafArb, weight: 4 },
		{
			arbitrary: fc
				.record({
					horizontal: fc.boolean(),
					spacing: spacingArb,
					children: fc.array(tie("tree"), { minLength: 1, maxLength: 4 }),
				})
				.map(({ horizontal, spacing, children }) => ({
					type: horizontal ? "StackH" : "StackV",
					props: { spacing },
					children,
				})),
			weight: 2,
		},
		{
			arbitrary: fc
				.record({
					padding: fc.integer({ min: 0, max: 30 }),
					child: tie("tree"),
				})
				.map(({ padding, child }) => ({
					type: "Background",
					props: { padding },
					children: [child],
				})),
			weight: 1,
		},
		{
			arbitrary: fc
				.record({
					children: fc.array(tie("tree"), { minLength: 1, maxLength: 3 }),
				})
				.map(({ children }) => ({ type: "Group", children })),
			weight: 1,
		},
	),
}));

// Flat leaves plus relational operators over Refs, planet-tutorial style.
const refOpSceneArb = fc
	.record({
		leaves: fc.array(leafArb, { minLength: 2, maxLength: 5 }),
		ops: fc.array(
			fc.record({
				kind: fc.constantFrom("align", "distribute"),
				axis: fc.constantFrom("x", "y"),
				alignment: fc.constantFrom("left", "center", "right", "top", "bottom"),
				spacing: fc.integer({ min: 0, max: 50 }),
				targets: fc.uniqueArray(fc.integer({ min: 0, max: 4 }), {
					minLength: 2,
					maxLength: 4,
				}),
			}),
			{ minLength: 0, maxLength: 3 },
		),
	})
	.map(({ leaves, ops }) => {
		const idLeaves = withIds(leaves as JsonNode[]);
		const opNodes = ops
			.map((op, i) => {
				const targets = op.targets.filter((t) => t < idLeaves.length);
				if (targets.length < 2) return undefined;
				const children = targets.map((t) => ({
					type: "Ref",
					target: `leaf${t}`,
				}));
				if (op.kind === "align") {
					return {
						type: "Align",
						id: `align${i}`,
						props: { axis: op.axis, alignment: op.alignment },
						children,
					};
				}
				return {
					type: "Distribute",
					id: `dist${i}`,
					props: { axis: op.axis, spacing: op.spacing },
					children,
				};
			})
			.filter((n) => n !== undefined) as JsonNode[];
		return {
			type: "Group",
			id: "root",
			children: [...idLeaves, ...opNodes],
		} as JsonNode;
	});

function leafSize(leaf: { type: string; props: Record<string, unknown> }): {
	width: number;
	height: number;
} {
	if (leaf.type === "Rect") {
		return {
			width: leaf.props.width as number,
			height: leaf.props.height as number,
		};
	}
	if (leaf.type === "Circle") {
		const r = leaf.props.r as number;
		return { width: r * 2, height: r * 2 };
	}
	return {
		width: ((leaf.props.text as string) ?? "").length * 8,
		height: 16,
	};
}

// ---------------------------------------------------------------------------
// Stack semantics
// ---------------------------------------------------------------------------

describe("stack layout properties", () => {
	it("children are packed along the axis with exact spacing and no overlap", () => {
		fc.assert(
			fc.property(stackSceneArb, ({ horizontal, spacing, leaves }) => {
				const alignments = horizontal
					? ["top", "centerY", "bottom"]
					: ["left", "centerX", "right"];
				const json = {
					type: horizontal ? "StackH" : "StackV",
					id: "stack",
					props: { spacing, alignment: alignments[0] },
					children: withIds(leaves as JsonNode[]),
				};
				const { layout } = solveJson(json);
				for (let i = 0; i + 1 < leaves.length; i++) {
					const a = layout[`leaf${i}`];
					const b = layout[`leaf${i + 1}`];
					if (horizontal) {
						expect(close(b.x, a.x + a.width + spacing)).toBe(true);
					} else {
						expect(close(b.y, a.y + a.height + spacing)).toBe(true);
					}
				}
			}),
		);
	});

	it("container size is the sum along the axis and the max across it", () => {
		fc.assert(
			fc.property(stackSceneArb, ({ horizontal, spacing, leaves }) => {
				const json = {
					type: horizontal ? "StackH" : "StackV",
					id: "stack",
					props: { spacing },
					children: withIds(leaves as JsonNode[]),
				};
				const { layout } = solveJson(json);
				const sizes = (
					leaves as { type: string; props: Record<string, unknown> }[]
				).map(leafSize);
				const along = horizontal
					? sizes.reduce((s, z) => s + z.width, 0)
					: sizes.reduce((s, z) => s + z.height, 0);
				const across = horizontal
					? Math.max(...sizes.map((z) => z.height))
					: Math.max(...sizes.map((z) => z.width));
				const total = along + spacing * (leaves.length - 1);
				const c = layout.stack;
				if (horizontal) {
					expect(close(c.width, total)).toBe(true);
					expect(close(c.height, across)).toBe(true);
				} else {
					expect(close(c.height, total)).toBe(true);
					expect(close(c.width, across)).toBe(true);
				}
			}),
		);
	});

	it("cross-axis alignment holds for every child", () => {
		fc.assert(
			fc.property(
				stackSceneArb,
				({ horizontal, spacing, alignmentIndex, leaves }) => {
					const alignments = horizontal
						? (["top", "centerY", "bottom"] as const)
						: (["left", "centerX", "right"] as const);
					const alignment = alignments[alignmentIndex];
					const json = {
						type: horizontal ? "StackH" : "StackV",
						id: "stack",
						props: { spacing, alignment },
						children: withIds(leaves as JsonNode[]),
					};
					const { layout } = solveJson(json);
					// Every child shares one alignment line across the axis
					const lines = leaves.map((_l, i) => {
						const b = layout[`leaf${i}`];
						if (horizontal) {
							if (alignment === "top") return b.y;
							if (alignment === "centerY") return b.y + b.height / 2;
							return b.y + b.height;
						}
						if (alignment === "left") return b.x;
						if (alignment === "centerX") return b.x + b.width / 2;
						return b.x + b.width;
					});
					for (const line of lines) {
						expect(close(line, lines[0])).toBe(true);
					}
				},
			),
		);
	});
});

// ---------------------------------------------------------------------------
// Align semantics
// ---------------------------------------------------------------------------

describe("align properties", () => {
	// The anchor is the first child whose position is owned — here every rect
	// has explicit x/y, so the first child always supplies the line.
	it("left/top aligns everything to the first child's edge", () => {
		fc.assert(
			fc.property(alignSceneArb, ({ axis, rects }) => {
				const alignment = axis === "x" ? "left" : "top";
				const json = {
					type: "Group",
					id: "root",
					children: [
						...rects.map((r, i) => ({ type: "Rect", id: `r${i}`, props: r })),
						{
							type: "Align",
							id: "a",
							props: { axis, alignment },
							children: rects.map((_r, i) => ({
								type: "Ref",
								target: `r${i}`,
							})),
						},
					],
				};
				const { layout } = solveJson(json);
				const line = axis === "x" ? rects[0].x : rects[0].y;
				for (let i = 0; i < rects.length; i++) {
					const v = axis === "x" ? layout[`r${i}`].x : layout[`r${i}`].y;
					expect(close(v, line)).toBe(true);
				}
			}),
		);
	});

	it("right/bottom aligns trailing edges to the first child's edge", () => {
		fc.assert(
			fc.property(alignSceneArb, ({ axis, rects }) => {
				const alignment = axis === "x" ? "right" : "bottom";
				const json = {
					type: "Group",
					id: "root",
					children: [
						...rects.map((r, i) => ({ type: "Rect", id: `r${i}`, props: r })),
						{
							type: "Align",
							id: "a",
							props: { axis, alignment },
							children: rects.map((_r, i) => ({
								type: "Ref",
								target: `r${i}`,
							})),
						},
					],
				};
				const { layout } = solveJson(json);
				const line =
					axis === "x"
						? rects[0].x + rects[0].width
						: rects[0].y + rects[0].height;
				for (let i = 0; i < rects.length; i++) {
					const b = layout[`r${i}`];
					const edge = axis === "x" ? b.x + b.width : b.y + b.height;
					expect(close(edge, line)).toBe(true);
				}
			}),
		);
	});

	it("center collapses all centers onto the first child's center", () => {
		fc.assert(
			fc.property(alignSceneArb, ({ axis, rects }) => {
				const json = {
					type: "Group",
					id: "root",
					children: [
						...rects.map((r, i) => ({ type: "Rect", id: `r${i}`, props: r })),
						{
							type: "Align",
							id: "a",
							props: { axis, alignment: "center" },
							children: rects.map((_r, i) => ({
								type: "Ref",
								target: `r${i}`,
							})),
						},
					],
				};
				const { layout } = solveJson(json);
				const centers = rects.map((_r, i) => {
					const b = layout[`r${i}`];
					return axis === "x" ? b.x + b.width / 2 : b.y + b.height / 2;
				});
				const expected =
					axis === "x"
						? rects[0].x + rects[0].width / 2
						: rects[0].y + rects[0].height / 2;
				for (const c of centers) {
					expect(close(c, expected)).toBe(true);
				}
			}),
		);
	});
});

// ---------------------------------------------------------------------------
// Distribute semantics
// ---------------------------------------------------------------------------

describe("distribute properties", () => {
	it("positive spacing yields exactly that gap between consecutive boxes", () => {
		fc.assert(
			fc.property(distributeSceneArb, ({ axis, spacing, rects }) => {
				const json = {
					type: "Group",
					id: "root",
					children: [
						...rects.map((r, i) => ({ type: "Rect", id: `r${i}`, props: r })),
						{
							type: "Distribute",
							id: "d",
							props: { axis, spacing },
							children: rects.map((_r, i) => ({
								type: "Ref",
								target: `r${i}`,
							})),
						},
					],
				};
				const { layout } = solveJson(json);
				for (let i = 0; i + 1 < rects.length; i++) {
					const a = layout[`r${i}`];
					const b = layout[`r${i + 1}`];
					const gap =
						axis === "x" ? b.x - (a.x + a.width) : b.y - (a.y + a.height);
					expect(close(gap, spacing)).toBe(true);
				}
			}),
		);
	});

	it("the first child is the anchor and never moves", () => {
		fc.assert(
			fc.property(distributeSceneArb, ({ axis, spacing, rects }) => {
				const json = {
					type: "Group",
					id: "root",
					children: [
						...rects.map((r, i) => ({ type: "Rect", id: `r${i}`, props: r })),
						{
							type: "Distribute",
							id: "d",
							props: { axis, spacing },
							children: rects.map((_r, i) => ({
								type: "Ref",
								target: `r${i}`,
							})),
						},
					],
				};
				const { layout } = solveJson(json);
				const first = rects[0];
				const b = layout.r0;
				if (axis === "x") expect(close(b.x, first.x)).toBe(true);
				else expect(close(b.y, first.y)).toBe(true);
			}),
		);
	});
});

// ---------------------------------------------------------------------------
// Background semantics
// ---------------------------------------------------------------------------

describe("background properties", () => {
	it("the box is the child's bounds inflated by padding on all sides", () => {
		fc.assert(
			fc.property(
				fc.record({
					padding: fc.integer({ min: 0, max: 30 }),
					leaf: leafArb,
				}),
				({ padding, leaf }) => {
					const json = {
						type: "Background",
						id: "bg",
						props: { padding },
						children: [{ ...(leaf as JsonNode), id: "child" }],
					};
					const { layout } = solveJson(json);
					const child = layout.child;
					const box = layout.bg;
					expect(close(box.x, child.x - padding)).toBe(true);
					expect(close(box.y, child.y - padding)).toBe(true);
					expect(close(box.width, child.width + padding * 2)).toBe(true);
					expect(close(box.height, child.height + padding * 2)).toBe(true);
				},
			),
		);
	});
});

// ---------------------------------------------------------------------------
// Whole-pipeline fuzzing: anything the schema accepts must not crash, must
// converge to finite values, must validate, and must serialize to sane SVG.
// ---------------------------------------------------------------------------

const anySceneArb = fc.oneof(nestedNodeArb, refOpSceneArb);

describe("pipeline fuzzing", () => {
	it("generated scenes pass schema validation", async () => {
		await fc.assert(
			fc.asyncProperty(anySceneArb, async (json) => {
				await validate(json);
			}),
			{ numRuns: 200 },
		);
	});

	it("solving never crashes and every coordinate is finite", () => {
		fc.assert(
			fc.property(anySceneArb, (json) => {
				const { layout } = solveJson(json as JsonNode);
				for (const box of Object.values(layout)) {
					expect(Number.isFinite(box.x)).toBe(true);
					expect(Number.isFinite(box.y)).toBe(true);
					expect(Number.isFinite(box.width)).toBe(true);
					expect(Number.isFinite(box.height)).toBe(true);
				}
			}),
			{ numRuns: 300 },
		);
	});

	it("solving is deterministic", () => {
		fc.assert(
			fc.property(anySceneArb, (json) => {
				const a = solveLayout(buildSceneFromJson(json as JsonNode));
				const b = solveLayout(buildSceneFromJson(json as JsonNode));
				expect(a).toEqual(b);
			}),
			{ numRuns: 100 },
		);
	});

	it("node ids are unique", () => {
		fc.assert(
			fc.property(anySceneArb, (json) => {
				const scene = buildSceneFromJson(json as JsonNode);
				const ids = scene.nodes.map((n) => n.id);
				expect(new Set(ids).size).toBe(ids.length);
			}),
			{ numRuns: 200 },
		);
	});

	it("serialized SVG has no NaN/Infinity and balanced markup", () => {
		fc.assert(
			fc.property(
				anySceneArb,
				fc.integer({ min: 0, max: 20 }),
				(json, margin) => {
					const scene = buildSceneFromJson(json as JsonNode);
					const layout = solveLayout(scene);
					const svg = layoutToSvg(layout, scene.nodes, margin);
					expect(svg).not.toContain("NaN");
					expect(svg).not.toContain("Infinity");
					const opens = svg.match(/<(?!\/)[a-z]+/g) ?? [];
					const closes = svg.match(/<\/[a-z]+>|\/>/g) ?? [];
					expect(opens.length).toBe(closes.length);
				},
			),
			{ numRuns: 200 },
		);
	});

	it("XML special characters in text content are escaped", () => {
		fc.assert(
			fc.property(fc.string({ minLength: 1, maxLength: 20 }), (text) => {
				const json = {
					type: "Text",
					id: "t",
					props: { text },
				};
				const scene = buildSceneFromJson(json);
				const layout = solveLayout(scene);
				const svg = layoutToSvg(layout, scene.nodes);
				const body = svg.replace(/<[^>]*>/g, "");
				expect(body).not.toMatch(/[<]/);
				expect(body).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;|#)/);
			}),
			{ numRuns: 200 },
		);
	});

	it("every emitted shape lies inside the SVG viewport", () => {
		fc.assert(
			fc.property(
				anySceneArb,
				fc.integer({ min: 0, max: 20 }),
				(json, margin) => {
					const scene = buildSceneFromJson(json as JsonNode);
					const layout = solveLayout(scene);
					const svg = layoutToSvg(layout, scene.nodes, margin);
					const width = Number(svg.match(/width="([^"]+)"/)?.[1]);
					const height = Number(svg.match(/height="([^"]+)"/)?.[1]);
					const rects = [
						...svg.matchAll(
							/<rect[^>]*\bx="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/g,
						),
					];
					for (const m of rects) {
						const [x, y, w, h] = m.slice(1).map(Number);
						expect(x).toBeGreaterThanOrEqual(-EPS);
						expect(y).toBeGreaterThanOrEqual(-EPS);
						expect(x + w).toBeLessThanOrEqual(width + EPS);
						expect(y + h).toBeLessThanOrEqual(height + EPS);
					}
					const circles = [
						...svg.matchAll(
							/<circle[^>]*\bcx="([^"]+)" cy="([^"]+)" r="([^"]+)"/g,
						),
					];
					for (const m of circles) {
						const [cx, cy, r] = m.slice(1).map(Number);
						expect(cx - r).toBeGreaterThanOrEqual(-EPS);
						expect(cy - r).toBeGreaterThanOrEqual(-EPS);
						expect(cx + r).toBeLessThanOrEqual(width + EPS);
						expect(cy + r).toBeLessThanOrEqual(height + EPS);
					}
				},
			),
			{ numRuns: 200 },
		);
	});
});
