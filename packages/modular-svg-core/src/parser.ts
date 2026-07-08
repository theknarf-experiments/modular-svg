import { parseColor } from "./color.ts";
import type {
	AlignmentX,
	AlignmentY,
	LayoutOperator,
	NodeRecord,
	SubtreeChild,
} from "./solver/operators.ts";
import {
	alignX,
	alignY,
	backgroundOp,
	contrastOp,
	distinctColorsOp,
	distributeX,
	distributeY,
	lineOp,
	sameColorOp,
	shadeColorOp,
	spanOp,
	stackH,
	stackV,
	unionOp,
} from "./solver/operators.ts";

export type JsonScene = {
	nodes: NodeRecord[];
	operators: LayoutOperator[];
	/** operators over the color array (3 slots per node: h, s, l) */
	colorOperators: LayoutOperator[];
	/** initial h,s,l per node */
	colorSeed: number[];
	/** ids whose solved color should be emitted */
	coloredIds: string[];
	/** Ownership conflicts detected at parse time (over-constrained scenes) */
	warnings: string[];
};
type AnyNode = {
	type: string;
	id?: string;
	key?: string;
	props?: Record<string, unknown>;
	children?: AnyNode[];
	target?: string;
};

// Map Bluefish alignment keywords to per-axis 1D alignments. 1D keywords
// imply their axis; 2D keywords expand to both axes; the legacy "center"
// resolves through the axis prop.
function parseAlignments(
	props: Record<string, unknown>,
): Array<
	{ axis: "x"; alignment: AlignmentX } | { axis: "y"; alignment: AlignmentY }
> {
	const raw =
		(props.alignment as string) ?? (props.type as string) ?? undefined;
	const hasAxis = props.axis !== undefined || props.direction !== undefined;
	const axisProp =
		(props.axis as "x" | "y") ?? (props.direction as "x" | "y") ?? "x";
	const twoD: Record<string, [AlignmentY, AlignmentX]> = {
		topLeft: ["top", "left"],
		topCenter: ["top", "centerX"],
		topRight: ["top", "right"],
		centerLeft: ["centerY", "left"],
		centerRight: ["centerY", "right"],
		bottomLeft: ["bottom", "left"],
		bottomCenter: ["bottom", "centerX"],
		bottomRight: ["bottom", "right"],
	};
	// Bluefish's 2D "center" aligns both axes; with an explicit axis prop it
	// stays 1D for backwards compatibility
	if (raw === "center" && !hasAxis) {
		return [
			{ axis: "y", alignment: "centerY" },
			{ axis: "x", alignment: "centerX" },
		];
	}
	if (raw && raw in twoD) {
		const [ay, ax] = twoD[raw];
		return [
			{ axis: "y", alignment: ay },
			{ axis: "x", alignment: ax },
		];
	}
	if (raw === "left" || raw === "centerX" || raw === "right") {
		return [{ axis: "x", alignment: raw }];
	}
	if (raw === "top" || raw === "centerY" || raw === "bottom") {
		return [{ axis: "y", alignment: raw }];
	}
	// Legacy: "center" (or nothing) on an explicit axis
	if (axisProp === "y") {
		return [{ axis: "y", alignment: raw === "center" ? "centerY" : "top" }];
	}
	return [{ axis: "x", alignment: raw === "center" ? "centerX" : "left" }];
}

// Bounds of an SVG path restricted to linear commands (M m L l H h V v Z z).
// Curves are not supported (Bluefish measures paths with paper.js; we
// deliberately support only the linear subset).
export function linearPathBounds(
	d: string,
): { minX: number; minY: number; maxX: number; maxY: number } | undefined {
	const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi);
	if (!tokens) return undefined;
	let x = 0;
	let y = 0;
	let startX = 0;
	let startY = 0;
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	let cmd = "";
	let i = 0;
	const record = () => {
		minX = Math.min(minX, x);
		minY = Math.min(minY, y);
		maxX = Math.max(maxX, x);
		maxY = Math.max(maxY, y);
	};
	while (i < tokens.length) {
		const t = tokens[i];
		if (/[a-zA-Z]/.test(t)) {
			cmd = t;
			i++;
			if (cmd === "Z" || cmd === "z") {
				x = startX;
				y = startY;
			}
			continue;
		}
		const first = i === 0;
		switch (cmd) {
			case "M":
			case "L":
				x = Number(tokens[i]);
				y = Number(tokens[i + 1]);
				i += 2;
				break;
			case "m":
			case "l":
				x += Number(tokens[i]);
				y += Number(tokens[i + 1]);
				i += 2;
				break;
			case "H":
				x = Number(tokens[i]);
				i += 1;
				break;
			case "h":
				x += Number(tokens[i]);
				i += 1;
				break;
			case "V":
				y = Number(tokens[i]);
				i += 1;
				break;
			case "v":
				y += Number(tokens[i]);
				i += 1;
				break;
			default:
				// unsupported command: skip the token
				i += 1;
				continue;
		}
		if (first || cmd === "M" || cmd === "m") {
			startX = x;
			startY = y;
			// subsequent pairs of an M/m are implicit linetos
			cmd = cmd === "M" ? "L" : "l";
		}
		record();
	}
	if (minX === Infinity) return undefined;
	return { minX, minY, maxX, maxY };
}

export function buildSceneFromJson(json: Record<string, unknown>): JsonScene {
	const nodes: NodeRecord[] = [];
	const nodeMap = new Map<string, NodeRecord>();
	const usedIds = new Set<string>();
	// Axes explicitly positioned by the user via props (soft ownership)
	const userOwned = new Set<string>();
	// Structural children (Refs excluded) for subtree moves
	const structuralChildren = new Map<string, NodeRecord[]>();
	type Desc =
		| {
				kind: "stackV" | "stackH";
				container: NodeRecord;
				children: NodeRecord[];
				props: Record<string, unknown>;
		  }
		| {
				kind: "align";
				children: NodeRecord[];
				props: Record<string, unknown>;
		  }
		| {
				kind: "distribute";
				axis: "x" | "y";
				children: NodeRecord[];
				props: Record<string, unknown>;
		  }
		| {
				kind: "background";
				box: NodeRecord;
				children: NodeRecord[];
				props: Record<string, unknown>;
		  }
		| { kind: "span"; axis: "x" | "y"; children: NodeRecord[] }
		| {
				kind: "distinctColors";
				children: NodeRecord[];
				props: Record<string, unknown>;
		  }
		| { kind: "sameColor"; children: NodeRecord[] }
		| {
				kind: "shade";
				children: NodeRecord[];
				delta: number;
		  }
		| {
				kind: "contrast";
				children: NodeRecord[];
				props: Record<string, unknown>;
		  }
		| { kind: "line"; line: NodeRecord; children: NodeRecord[] }
		| { kind: "union"; container: NodeRecord; children: NodeRecord[] };
	const descs: Desc[] = [];

	function generateId(node: AnyNode, path: string): string {
		// Prefer 'key' over 'id' over auto-generated
		if (node.key) {
			if (usedIds.has(node.key)) {
				throw new Error(`Duplicate key: ${node.key}`);
			}
			usedIds.add(node.key);
			return node.key;
		}

		if (node.id) {
			if (usedIds.has(node.id)) {
				throw new Error(`Duplicate id: ${node.id}`);
			}
			usedIds.add(node.id);
			return node.id;
		}

		// Auto-generate deterministic ID based on tree path
		let id = `${node.type.toLowerCase()}-${path}`;
		// Handle duplicates by appending counter
		if (usedIds.has(id)) {
			let counter = 1;
			while (usedIds.has(`${id}-${counter}`)) {
				counter++;
			}
			id = `${id}-${counter}`;
		}
		usedIds.add(id);
		return id;
	}

	// Props consumed by layout; everything else passes through as SVG attrs
	const LAYOUT_PROPS = new Set([
		"x",
		"y",
		"width",
		"height",
		"r",
		"cx",
		"cy",
		"text",
		"spacing",
		"alignment",
		"axis",
		"direction",
		"padding",
		"total",
		"zOrder",
		"source",
		"target",
		"href",
		"d",
		"innerR",
		"startAngle",
		"endAngle",
		"fill",
		"stroke",
		"stroke-width",
		"bow",
		"stretch",
		"stretchMin",
		"stretchMax",
		"padStart",
		"padEnd",
		"flip",
		"straights",
		"start",
	]);

	function extraAttrs(
		props: Record<string, unknown>,
	): Record<string, string | number> | undefined {
		let attrs: Record<string, string | number> | undefined;
		for (const [k, v] of Object.entries(props)) {
			if (LAYOUT_PROPS.has(k)) continue;
			if (typeof v !== "string" && typeof v !== "number") continue;
			if (!/^[a-zA-Z_][\w:.-]*$/.test(k)) continue;
			if (attrs === undefined) attrs = {};
			attrs[k] = v;
		}
		return attrs;
	}

	function ensureNode(n: AnyNode, path: string): NodeRecord {
		if (n.type === "Ref") {
			const target = nodeMap.get(n.target as string);
			if (!target) throw new Error(`Unknown ref ${n.target}`);
			return target;
		}

		const nodeId = generateId(n, path);
		const existing = nodeMap.get(nodeId);
		if (existing) return existing;
		let rec: NodeRecord;
		const props = (n.props ?? {}) as Record<string, unknown>;
		const common = {
			id: nodeId,
			fill: props.fill as string | undefined,
			stroke: props.stroke as string | undefined,
			zOrder: props.zOrder as number | undefined,
			attrs: extraAttrs(props),
		};
		if (n.type === "Rect") {
			rec = {
				...common,
				type: "rect",
				x: (props.x as number | undefined) ?? 0,
				y: (props.y as number | undefined) ?? 0,
				width: (props.width as number | undefined) ?? 0,
				height: (props.height as number | undefined) ?? 0,
				strokeWidth: (props["stroke-width"] as number | undefined) ?? 3,
			};
		} else if (n.type === "Background") {
			rec = {
				...common,
				type: "rect",
				x: 0,
				y: 0,
				width: 0,
				height: 0,
				strokeWidth: (props["stroke-width"] as number | undefined) ?? 3,
			};
		} else if (n.type === "Circle") {
			const r = (props.r as number | undefined) ?? 0;
			// Bluefish circles are center-anchored (cx/cy); top-left x/y also works
			const cx = props.cx as number | undefined;
			const cy = props.cy as number | undefined;
			rec = {
				...common,
				type: "circle",
				r,
				x: cx !== undefined ? cx - r : ((props.x as number | undefined) ?? 0),
				y: cy !== undefined ? cy - r : ((props.y as number | undefined) ?? 0),
				width: r * 2,
				height: r * 2,
				strokeWidth: props["stroke-width"] as number | undefined,
			};
		} else if (n.type === "Text") {
			// Heuristic text metrics: half an em per character, one em tall
			const fontSize = Number(props["font-size"] ?? 16);
			rec = {
				...common,
				type: "text",
				text: (props.text as string | undefined) ?? "",
				x: (props.x as number | undefined) ?? 0,
				y: (props.y as number | undefined) ?? 0,
				width:
					(props.width as number | undefined) ??
					((props.text as string | undefined)?.length ?? 0) * fontSize * 0.5,
				height: (props.height as number | undefined) ?? fontSize,
				fill: (props.fill as string | undefined) ?? "black",
				strokeWidth: props["stroke-width"] as number | undefined,
			};
		} else if (n.type === "Path") {
			const d = (props.d as string) ?? "";
			const b = linearPathBounds(d);
			rec = {
				...common,
				type: "path",
				d,
				dOrigin: { x: b?.minX ?? 0, y: b?.minY ?? 0 },
				x: b?.minX ?? 0,
				y: b?.minY ?? 0,
				width: b ? b.maxX - b.minX : 0,
				height: b ? b.maxY - b.minY : 0,
				strokeWidth: (props["stroke-width"] as number | undefined) ?? 3,
			};
		} else if (n.type === "Image") {
			rec = {
				...common,
				type: "image",
				href: props.href as string | undefined,
				x: (props.x as number | undefined) ?? 0,
				y: (props.y as number | undefined) ?? 0,
				width: (props.width as number | undefined) ?? 0,
				height: (props.height as number | undefined) ?? 0,
			};
		} else if (n.type === "Arrow") {
			rec = {
				...common,
				type: "arrow",
				x: 0,
				y: 0,
				width: 0,
				height: 0,
				strokeWidth: (props["stroke-width"] as number | undefined) ?? 3,
				arrow: {
					padStart: (props.padStart as number | undefined) ?? 5,
					padEnd: (props.padEnd as number | undefined) ?? 5,
				},
			};
		} else if (n.type === "Arc") {
			const r = (props.r as number | undefined) ?? 0;
			const cx = props.cx as number | undefined;
			const cy = props.cy as number | undefined;
			rec = {
				...common,
				type: "arc",
				r,
				innerR: props.innerR as number | undefined,
				startAngle: (props.startAngle as number | undefined) ?? 0,
				endAngle: (props.endAngle as number | undefined) ?? 360,
				x: cx !== undefined ? cx - r : ((props.x as number | undefined) ?? 0),
				y: cy !== undefined ? cy - r : ((props.y as number | undefined) ?? 0),
				width: r * 2,
				height: r * 2,
				strokeWidth: props["stroke-width"] as number | undefined,
			};
		} else if (n.type === "Line" || n.type === "Curve") {
			rec = {
				...common,
				type: n.type === "Line" ? "line" : "curve",
				x: 0,
				y: 0,
				width: 0,
				height: 0,
				source: props.source as number[] | undefined,
				target: props.target as number[] | undefined,
				curveDirection:
					n.type === "Curve"
						? ((props.direction as "horizontal" | "vertical" | undefined) ??
							"auto")
						: undefined,
				stroke: (props.stroke as string | undefined) ?? "black",
				strokeWidth: (props["stroke-width"] as number | undefined) ?? 3,
			};
		} else {
			rec = {
				id: nodeId,
				x: 0,
				y: 0,
				width: 0,
				height: 0,
				zOrder: props.zOrder as number | undefined,
			};
		}
		if (
			n.type === "Rect" ||
			n.type === "Circle" ||
			n.type === "Text" ||
			n.type === "Image" ||
			n.type === "Path" ||
			n.type === "Arc"
		) {
			if (props.x !== undefined || props.cx !== undefined)
				userOwned.add(`${nodeId}:x`);
			if (props.y !== undefined || props.cy !== undefined)
				userOwned.add(`${nodeId}:y`);
			// Extent ownership: explicit sizes, a circle's radius, and text's
			// measured size all count as owned (matching Bluefish)
			const sized =
				n.type === "Circle" ||
				n.type === "Text" ||
				n.type === "Path" ||
				n.type === "Arc";
			if (props.width !== undefined || sized) userOwned.add(`${nodeId}:w`);
			if (props.height !== undefined || sized) userOwned.add(`${nodeId}:h`);
		}
		nodeMap.set(rec.id, rec);
		nodes.push(rec);
		return rec;
	}

	function walk(node: AnyNode, path = "0"): NodeRecord {
		const rec = ensureNode(node, path);
		if (Array.isArray(node.children)) {
			const children = node.children.map((child, i) =>
				walk(child, `${path}.${i}`),
			);
			structuralChildren.set(
				rec.id,
				node.children
					.map((child, i) => ({ child, rec: children[i] }))
					.filter(({ child }) => child.type !== "Ref")
					.map(({ rec: r }) => r),
			);
			if (node.type === "StackV" || node.type === "StackH") {
				descs.push({
					kind: node.type === "StackV" ? "stackV" : "stackH",
					container: rec,
					children,
					props: node.props ?? {},
				});
			} else if (node.type === "Align") {
				descs.push({
					kind: "align",
					children,
					props: node.props ?? {},
				});
				descs.push({ kind: "union", container: rec, children });
			} else if (node.type === "Distribute") {
				// Bluefish uses direction horizontal/vertical; axis x/y also works
				const raw =
					(node.props?.axis as string) ??
					(node.props?.direction as string) ??
					"x";
				descs.push({
					kind: "distribute",
					axis: raw === "y" || raw === "vertical" ? "y" : "x",
					children,
					props: node.props ?? {},
				});
				descs.push({ kind: "union", container: rec, children });
			} else if (node.type === "Background" && children[0]) {
				descs.push({
					kind: "background",
					box: rec,
					children,
					props: node.props ?? {},
				});
			} else if (node.type === "Arrow" && children.length >= 2) {
				(rec as NodeRecord).from = children[0].id;
				(rec as NodeRecord).to = children[1].id;
				descs.push({ kind: "union", container: rec, children });
			} else if (
				(node.type === "Line" || node.type === "Curve") &&
				children.length >= 2
			) {
				(rec as NodeRecord).from = children[0].id;
				(rec as NodeRecord).to = children[1].id;
				descs.push({ kind: "line", line: rec, children });
			} else if (node.type === "Span" && children.length >= 2) {
				descs.push({
					kind: "span",
					axis: (node.props?.axis as "x" | "y") ?? "x",
					children,
				});
				descs.push({ kind: "union", container: rec, children });
			} else if (node.type === "DistinctColors" && children.length > 0) {
				descs.push({
					kind: "distinctColors",
					children,
					props: node.props ?? {},
				});
				descs.push({ kind: "union", container: rec, children });
			} else if (node.type === "SameColor" && children.length >= 2) {
				descs.push({ kind: "sameColor", children });
				descs.push({ kind: "union", container: rec, children });
			} else if (
				(node.type === "Lighten" || node.type === "Darken") &&
				children.length >= 2
			) {
				const amount = (node.props?.amount as number | undefined) ?? 0.15;
				descs.push({
					kind: "shade",
					children,
					delta: node.type === "Lighten" ? amount : -amount,
				});
				descs.push({ kind: "union", container: rec, children });
			} else if (node.type === "Contrast" && children.length >= 2) {
				descs.push({ kind: "contrast", children, props: node.props ?? {} });
				descs.push({ kind: "union", container: rec, children });
			} else if (children.length > 0) {
				// Group and any other plain container: bbox = union of children
				descs.push({ kind: "union", container: rec, children });
			}
		}
		return rec;
	}

	walk(json as AnyNode);

	const indexMap = new Map<string, number>();
	nodes.forEach((n, i) => {
		indexMap.set(n.id, i * 4);
	});

	function baseOf(rec: NodeRecord): number {
		const idx = indexMap.get(rec.id);
		if (idx === undefined) throw new Error(`Unknown id ${rec.id}`);
		return idx;
	}

	// Structural subtree of a node (itself plus all descendants), as slot bases
	const subtreeCache = new Map<string, number[]>();
	function subtreeBases(rec: NodeRecord): number[] {
		const cached = subtreeCache.get(rec.id);
		if (cached) return cached;
		const bases = [baseOf(rec)];
		for (const child of structuralChildren.get(rec.id) ?? []) {
			bases.push(...subtreeBases(child));
		}
		subtreeCache.set(rec.id, bases);
		return bases;
	}

	function toSubtreeChildren(children: NodeRecord[]): SubtreeChild[] {
		return children.map((c) => ({ base: baseOf(c), subtree: subtreeBases(c) }));
	}

	// Ownership: axes positioned by a relation (hard) or user props (soft).
	// The first owned child of a relation becomes its anchor and is never
	// moved; writing an already hard-owned axis is an over-constraint.
	// Containers, background boxes, and lines get GUIDE ownership: their
	// derived positions make them anchor-eligible (Bluefish's fixed-element
	// and group-as-guide behavior) without triggering conflicts.
	const hardOwned = new Set<string>();
	const guideOwned = new Set<string>();
	const warnings: string[] = [];

	function positionOwned(id: string, axis: "x" | "y"): boolean {
		const key = `${id}:${axis}`;
		return hardOwned.has(key) || userOwned.has(key) || guideOwned.has(key);
	}

	function markGuide(id: string): void {
		guideOwned.add(`${id}:x`);
		guideOwned.add(`${id}:y`);
	}

	function anchorIndex(children: NodeRecord[], axis: "x" | "y"): number | null {
		for (let i = 0; i < children.length; i++) {
			if (positionOwned(children[i].id, axis)) return i;
		}
		return null;
	}

	function claim(
		children: NodeRecord[],
		axis: "x" | "y",
		skip: number | null,
		relation: string,
	): void {
		for (let i = 0; i < children.length; i++) {
			if (i === skip) continue;
			const key = `${children[i].id}:${axis}`;
			if (hardOwned.has(key)) {
				warnings.push(
					`${relation} conflicts with another relation over ${key}`,
				);
			}
			hardOwned.add(key);
		}
	}

	function extentOwnedOf(children: NodeRecord[], axis: "w" | "h"): boolean[] {
		return children.map((c) => {
			const key = `${c.id}:${axis}`;
			return hardOwned.has(key) || userOwned.has(key);
		});
	}

	// Handle the Bluefish sizing modes' ownership effects: in total+spacing
	// mode unowned extents get assigned (and become owned); the other exact
	// modes require every extent to be owned already.
	function claimExtents(
		relation: string,
		children: NodeRecord[],
		axis: "w" | "h",
		spacing: number | undefined,
		total: number | undefined,
		extentOwned: boolean[],
	): void {
		if (spacing !== undefined && total !== undefined) {
			children.forEach((c, i) => {
				if (!extentOwned[i]) hardOwned.add(`${c.id}:${axis}`);
			});
		} else if (spacing !== undefined || total !== undefined) {
			children.forEach((c, i) => {
				if (!extentOwned[i]) {
					warnings.push(
						`${relation}: ${axis === "w" ? "width" : "height"} of ${c.id} is not owned`,
					);
				}
			});
		}
	}

	const ops: LayoutOperator[] = [];
	const colorOps: LayoutOperator[] = [];
	const coloredIds = new Set<string>();
	// Color slots: 3 per node (h, s, l), seeded from parseable fills.
	// A parseable explicit fill is a pinned (owned) color.
	const nodeIndex = new Map(nodes.map((n, i) => [n.id, i]));
	const colorSeed: number[] = [];
	const colorOwned: boolean[] = [];
	for (const n of nodes) {
		const parsed = n.fill !== undefined ? parseColor(n.fill) : undefined;
		colorSeed.push(parsed?.h ?? 0, parsed?.s ?? 0, parsed?.l ?? 0.5);
		colorOwned.push(n.fill !== undefined);
	}
	const colorBase = (rec: NodeRecord): number => {
		const i = nodeIndex.get(rec.id);
		if (i === undefined) throw new Error(`Unknown id ${rec.id}`);
		return i * 3;
	};

	for (const d of descs) {
		if (d.kind === "stackV" || d.kind === "stackH") {
			const mainAxis = d.kind === "stackV" ? "y" : "x";
			const crossAxis = d.kind === "stackV" ? "x" : "y";
			const extentAxis = d.kind === "stackV" ? "h" : "w";
			const mainAnchor = anchorIndex(d.children, mainAxis);
			const crossAnchor = anchorIndex(d.children, crossAxis);
			claim(d.children, mainAxis, mainAnchor, d.container.id);
			claim(d.children, crossAxis, crossAnchor, d.container.id);
			// Defaults match Bluefish: spacing 10 only when total is also unset
			const spacingProp = d.props.spacing as number | undefined;
			const total = d.props.total as number | undefined;
			const spacing =
				spacingProp === undefined && total === undefined ? 10 : spacingProp;
			const extentOwned = extentOwnedOf(d.children, extentAxis);
			claimExtents(
				d.container.id,
				d.children,
				extentAxis,
				spacing,
				total,
				extentOwned,
			);
			hardOwned.add(`${d.container.id}:w`);
			hardOwned.add(`${d.container.id}:h`);
			markGuide(d.container.id);
			const children = toSubtreeChildren(d.children);
			const containerIdx = baseOf(d.container);
			if (d.kind === "stackV") {
				ops.push(
					stackV(children, containerIdx, {
						spacing,
						total,
						alignment: (d.props.alignment as AlignmentX) ?? "centerX",
						mainAnchor,
						crossAnchor,
						extentOwned,
					}),
				);
			} else {
				ops.push(
					stackH(children, containerIdx, {
						spacing,
						total,
						alignment: (d.props.alignment as AlignmentY) ?? "centerY",
						mainAnchor,
						crossAnchor,
						extentOwned,
					}),
				);
			}
		} else if (d.kind === "align") {
			for (const { axis, alignment } of parseAlignments(d.props)) {
				const anchor = anchorIndex(d.children, axis) ?? 0;
				claim(d.children, axis, anchor, `align(${alignment})`);
				const children = toSubtreeChildren(d.children);
				if (axis === "x") {
					ops.push(alignX(children, alignment as AlignmentX, anchor));
				} else {
					ops.push(alignY(children, alignment as AlignmentY, anchor));
				}
			}
		} else if (d.kind === "distribute") {
			const spacing = d.props.spacing as number | undefined;
			const total = d.props.total as number | undefined;
			const exactMode = spacing !== undefined || total !== undefined;
			const extentAxis = d.axis === "x" ? "w" : "h";
			const anchor = anchorIndex(d.children, d.axis) ?? 0;
			claim(d.children, d.axis, exactMode ? anchor : null, "distribute");
			const extentOwned = extentOwnedOf(d.children, extentAxis);
			claimExtents(
				"distribute",
				d.children,
				extentAxis,
				spacing,
				total,
				extentOwned,
			);
			const children = toSubtreeChildren(d.children);
			const opts = { spacing, total, anchor, extentOwned };
			if (d.axis === "x") ops.push(distributeX(children, opts));
			else ops.push(distributeY(children, opts));
		} else if (d.kind === "background") {
			// Default padding matches Bluefish
			const padding = (d.props.padding as number) ?? 10;
			const width = d.props.width as number | undefined;
			const height = d.props.height as number | undefined;
			const xOwned = d.children.map((c) => positionOwned(c.id, "x"));
			const yOwned = d.children.map((c) => positionOwned(c.id, "y"));
			ops.push(
				backgroundOp(toSubtreeChildren(d.children), baseOf(d.box), {
					padding,
					width,
					height,
					xOwned,
					yOwned,
				}),
			);
			// Fixed axes center unowned content, claiming those positions
			if (width !== undefined) {
				d.children.forEach((c, i) => {
					if (!xOwned[i]) hardOwned.add(`${c.id}:x`);
				});
			}
			if (height !== undefined) {
				d.children.forEach((c, i) => {
					if (!yOwned[i]) hardOwned.add(`${c.id}:y`);
				});
			}
			hardOwned.add(`${d.box.id}:w`);
			hardOwned.add(`${d.box.id}:h`);
			markGuide(d.box.id);
		} else if (d.kind === "span") {
			const [source, ...targets] = d.children;
			for (const target of targets) {
				const posKey = `${target.id}:${d.axis}`;
				const extentKey = `${target.id}:${d.axis === "x" ? "w" : "h"}`;
				if (hardOwned.has(posKey) || hardOwned.has(extentKey)) {
					warnings.push(
						`span conflicts with another relation over ${target.id}`,
					);
				}
				hardOwned.add(posKey);
				hardOwned.add(extentKey);
				ops.push(
					spanOp(
						baseOf(source),
						{ base: baseOf(target), subtree: subtreeBases(target) },
						d.axis === "x",
					),
				);
			}
		} else if (d.kind === "line") {
			ops.push(
				lineOp(
					baseOf(d.children[0]),
					baseOf(d.children[1]),
					baseOf(d.line),
					d.line.source,
					d.line.target,
				),
			);
			hardOwned.add(`${d.line.id}:w`);
			hardOwned.add(`${d.line.id}:h`);
			markGuide(d.line.id);
		} else if (d.kind === "distinctColors") {
			const owned = d.children.map((c) => colorOwned[nodeIndex.get(c.id) ?? 0]);
			colorOps.push(
				distinctColorsOp(
					d.children.map((c) => colorBase(c)),
					{
						saturation: (d.props.saturation as number) ?? 0.6,
						lightness: (d.props.lightness as number) ?? 0.55,
						startHue: (d.props.startHue as number) ?? 30,
						owned,
					},
				),
			);
			d.children.forEach((c, i) => {
				if (!owned[i]) coloredIds.add(c.id);
			});
		} else if (d.kind === "sameColor") {
			const [source, ...targets] = d.children;
			colorOps.push(
				sameColorOp(
					colorBase(source),
					targets.map((t) => colorBase(t)),
				),
			);
			for (const t of targets) {
				coloredIds.add(t.id);
			}
		} else if (d.kind === "shade") {
			const [source, ...targets] = d.children;
			colorOps.push(
				shadeColorOp(
					colorBase(source),
					targets.map((t) => colorBase(t)),
					d.delta,
				),
			);
			for (const t of targets) {
				coloredIds.add(t.id);
			}
		} else if (d.kind === "contrast") {
			const [fg, bg] = d.children;
			colorOps.push(
				contrastOp(
					colorBase(fg),
					colorBase(bg),
					(d.props.ratio as number) ?? 4.5,
				),
			);
			coloredIds.add(fg.id);
		} else if (d.kind === "union") {
			ops.push(
				unionOp(
					d.children.map((c) => baseOf(c)),
					baseOf(d.container),
				),
			);
			hardOwned.add(`${d.container.id}:w`);
			hardOwned.add(`${d.container.id}:h`);
			markGuide(d.container.id);
		}
	}

	return {
		nodes,
		operators: ops,
		colorOperators: colorOps,
		colorSeed,
		coloredIds: [...coloredIds],
		warnings,
	};
}
