import { parseRgba, rgbToOklch } from "./color.ts";
import type { Ease } from "./motion.ts";
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
import { foldPhases, type LayoutBox } from "./solver/phases.ts";
import { COLOR_ANGLES, COLOR_SLOTS, solveColors } from "./solver/solver.ts";
import {
	buildTime,
	checkTime,
	MOTION_TYPES,
	motionSpecOf,
	TIME_TYPES,
	type TimeCheck,
	type TimeNode,
	unsettled,
	unsettledMessage,
} from "./time_scene.ts";

export type JsonScene = {
	nodes: NodeRecord[];
	operators: LayoutOperator[];
	/** the relation each layout operator came from */
	operatorNames: string[];
	/** the relation each color operator came from */
	colorOperatorNames: string[];
	/** operators over the color array (fill then stroke per node, COLOR_SLOTS each) */
	colorOperators: LayoutOperator[];
	/** initial OKLCH + alpha per node and paint */
	colorSeed: number[];
	/** solved paints to emit, as "id:fill" or "id:stroke" */
	coloredPaints: string[];
	/** operators over the time array (2 slots per node: start, duration) */
	timeOperators: LayoutOperator[];
	timeOperatorNames: string[];
	timeSeed: number[];
	timedIds: string[];
	/** run against a solved layout with checkTime */
	timeChecks: TimeCheck[];
	/** Ownership conflicts detected at parse time (over-constrained scenes) */
	warnings: string[];
	/**
	 * The layout relations that hold while these Modulates are active (in the
	 * order they started; later wins). Only present when the scene modulates
	 */
	phaseOperators?: (active: readonly string[]) => {
		operators: LayoutOperator[];
		names: string[];
	};
};
type AnyNode = {
	type: string;
	id?: string;
	key?: string;
	props?: Record<string, unknown>;
	children?: AnyNode[];
	target?: string;
	/** on a Ref: which of the node's colors a color relation means */
	paint?: Paint;
};

/** A node's two colors; color relations name one through a Ref's paint. */
export type Paint = "fill" | "stroke";

/** What a mark is drawn with: connectors are strokes, everything else fills. */
export const defaultPaint = (rec: NodeRecord): Paint =>
	rec.type === "line" || rec.type === "curve" || rec.type === "arrow"
		? "stroke"
		: "fill";

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

/** A scene with nothing in it. */
export const emptyScene = (): JsonScene => ({
	nodes: [],
	operators: [],
	operatorNames: [],
	colorOperators: [],
	colorOperatorNames: [],
	colorSeed: [],
	coloredPaints: [],
	timeOperators: [],
	timeOperatorNames: [],
	timeSeed: [],
	timedIds: [],
	timeChecks: [],
	warnings: [],
});

export function buildSceneFromJson(json: Record<string, unknown>): JsonScene {
	const nodes: NodeRecord[] = [];
	const nodeMap = new Map<string, NodeRecord>();
	const usedIds = new Set<string>();
	// Axes explicitly positioned by the user via props (soft ownership)
	const userOwned = new Set<string>();
	// Structural children (Refs excluded) for subtree moves
	const structuralChildren = new Map<string, NodeRecord[]>();
	// Every walked node in post-order, with all children, for the time domain
	const timeNodes: TimeNode[] = [];
	type Desc = (
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
				paints: Paint[];
				children: NodeRecord[];
				props: Record<string, unknown>;
		  }
		| { kind: "sameColor"; children: NodeRecord[]; paints: Paint[] }
		| {
				kind: "shade";
				paints: Paint[];
				children: NodeRecord[];
				delta: number;
		  }
		| {
				kind: "contrast";
				paints: Paint[];
				children: NodeRecord[];
				props: Record<string, unknown>;
		  }
		| { kind: "line"; line: NodeRecord; children: NodeRecord[] }
		| { kind: "union"; container: NodeRecord; children: NodeRecord[] }
	) & {
		/** the Modulate this relation belongs to; absent for the home layout */
		scope?: string;
	};
	const descs: Desc[] = [];
	const scopeWarnings: string[] = [];

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

	const MARK_TYPES = new Set([
		"Rect",
		"Circle",
		"Text",
		"Image",
		"Path",
		"Arc",
	]);
	// What a Modulate may hold: relations that place what they ref
	const MODULATED_TYPES = new Set(["StackV", "StackH", "Align", "Distribute"]);

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
		if (MOTION_TYPES.has(n.type)) {
			rec = {
				id: nodeId,
				x: 0,
				y: 0,
				width: 0,
				height: 0,
				type: "motion",
				motion: motionSpecOf(n.type, props),
			};
		} else if (TIME_TYPES.has(n.type)) {
			rec = { id: nodeId, x: 0, y: 0, width: 0, height: 0, type: "timing" };
		} else if (n.type === "Rect") {
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

	// `scope` is the Modulate being walked: its relations hold only while it does
	function walk(
		node: AnyNode,
		path = "0",
		scope?: string,
	): NodeRecord | undefined {
		if (scope !== undefined && node.type !== "Ref") {
			if (MARK_TYPES.has(node.type))
				scopeWarnings.push(
					`Modulate(${scope}) declares a ${node.type} inside it; declare marks outside and ref them`,
				);
			else if (!MODULATED_TYPES.has(node.type)) {
				scopeWarnings.push(
					`Modulate(${scope}): ${node.type} cannot be modulated and is ignored; only StackV, StackH, Align and Distribute can`,
				);
				return undefined;
			}
		}
		const rec = ensureNode(node, path);
		if (node.type === "Ref") return rec;
		if (scope !== undefined && MODULATED_TYPES.has(node.type))
			rec.scope = scope;
		const modulate = node.type === "Modulate";
		const walked = (node.children ?? []).flatMap((child, i) => {
			if (modulate && child.type === "Ref") {
				scopeWarnings.push(
					`Modulate(${rec.id}) refs ${child.target} outside a relation, which changes nothing`,
				);
				return [];
			}
			const r = walk(child, `${path}.${i}`, modulate ? rec.id : scope);
			return r ? [{ child, rec: r }] : [];
		});
		const allChildren = walked.map((w) => w.rec);
		const allStructural = walked
			.filter(({ child }) => child.type !== "Ref")
			.map(({ rec: r }) => r);
		timeNodes.push({
			rec,
			type: node.type,
			props: node.props ?? {},
			children: allChildren,
			structural: allStructural,
		});
		// Time-only nodes take no space, so layout relations never see them
		const spatial = (r: NodeRecord) =>
			r.type !== "motion" && r.type !== "timing";
		const children = allChildren.filter(spatial);
		// The paint each child stands for in a color relation
		const paints = allChildren
			.map((r, i) => ({
				r,
				paint: walked[i].child.paint ?? defaultPaint(r),
			}))
			.filter(({ r }) => spatial(r))
			.map(({ paint }) => paint);
		const structural = allStructural.filter(spatial);
		if (Array.isArray(node.children)) {
			structuralChildren.set(rec.id, structural);
			if (rec.type === "motion" || rec.type === "timing") {
				// Time-only nodes take no part in layout
			} else if (node.type === "StackV" || node.type === "StackH") {
				descs.push({
					kind: node.type === "StackV" ? "stackV" : "stackH",
					container: rec,
					children,
					props: node.props ?? {},
					scope,
				});
			} else if (node.type === "Align") {
				descs.push({
					kind: "align",
					children,
					props: node.props ?? {},
					scope,
				});
				descs.push({ kind: "union", container: rec, children, scope });
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
					scope,
				});
				descs.push({ kind: "union", container: rec, children, scope });
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
					paints,
					props: node.props ?? {},
				});
				descs.push({ kind: "union", container: rec, children });
			} else if (node.type === "SameColor" && children.length >= 2) {
				descs.push({ kind: "sameColor", children, paints });
				descs.push({ kind: "union", container: rec, children });
			} else if (
				(node.type === "Lighten" || node.type === "Darken") &&
				children.length >= 2
			) {
				const amount = (node.props?.amount as number | undefined) ?? 0.15;
				descs.push({
					kind: "shade",
					children,
					paints,
					delta: node.type === "Lighten" ? amount : -amount,
				});
				descs.push({ kind: "union", container: rec, children });
			} else if (node.type === "Contrast" && children.length >= 2) {
				descs.push({
					kind: "contrast",
					children,
					paints,
					props: node.props ?? {},
				});
				descs.push({ kind: "union", container: rec, children });
			} else if (children.length > 0) {
				// Group and any other plain container: bbox = union of children
				descs.push({ kind: "union", container: rec, children });
			}
		}
		return rec;
	}

	walk(json as AnyNode);

	// A modulated stack packs from its own box. When its members all sit in
	// one container it joins that container's subtree, so a relation that
	// moves the container while the stack holds carries the stack along
	const parentOf = new Map<string, string>();
	for (const [parent, members] of structuralChildren)
		for (const m of members) parentOf.set(m.id, parent);
	for (const d of descs) {
		if (d.scope === undefined || !(d.kind === "stackV" || d.kind === "stackH"))
			continue;
		const parents = new Set(d.children.map((c) => parentOf.get(c.id)));
		const [parent] = parents;
		if (parents.size === 1 && parent !== undefined)
			structuralChildren.get(parent)?.push(d.container);
	}

	const targetWarnings: string[] = [];
	// A motion animates the marks under each target (a container's descendants)
	const marksUnder = (rec: NodeRecord, seen = new Set<string>()): string[] => {
		if (seen.has(rec.id)) return [];
		seen.add(rec.id);
		const own =
			rec.type && rec.type !== "motion" && rec.type !== "timing"
				? [rec.id]
				: [];
		return [
			...own,
			...(structuralChildren.get(rec.id) ?? []).flatMap((c) =>
				marksUnder(c, seen),
			),
		];
	};
	for (const t of timeNodes) {
		if (t.type === "Modulate" || t.type === "Resolve")
			t.rec.modulation = {
				kind: t.type === "Modulate" ? "modulate" : "resolve",
				releases: t.type === "Resolve" ? t.children.map((c) => c.id) : [],
				...(t.props.ease !== undefined ? { ease: t.props.ease as Ease } : {}),
			};
		if (t.rec.type !== "motion") continue;
		// Travel moves its first child through the rest, which stay put
		const travel = t.rec.motion?.kind === "travel";
		const [mover, ...via] = t.children;
		if (t.rec.motion?.kind === "travel" && mover)
			t.rec.motion = { ...t.rec.motion, via: via.map((v) => v.id) };
		t.rec.targets = (travel ? (mover ? [mover] : []) : t.children).map((c) => ({
			id: c.id,
			marks: marksUnder(c),
		}));
		if (t.children.length === 0)
			targetWarnings.push(`${t.type}(${t.rec.id}) has no target`);
	}

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

	const warnings: string[] = [];
	const colorOps: LayoutOperator[] = [];
	// Solved paints to emit, as "id:fill" / "id:stroke"
	const coloredPaints = new Set<string>();
	// Color slots: two paints per node (fill, then stroke), COLOR_SLOTS each
	// (OKLCH lightness, chroma, hue, alpha), seeded from what the node sets.
	// An explicit color is a pinned one.
	const nodeIndex = new Map(nodes.map((n, i) => [n.id, i]));
	const colorSeed: number[] = [];
	const colorOwned = new Map<string, boolean>();
	// A pinned hue that DistinctColors steers around (grays have none)
	const pinnedHue = new Map<string, number | undefined>();
	for (const n of nodes) {
		for (const paint of ["fill", "stroke"] as const) {
			const value = n[paint];
			const parsed = value !== undefined ? parseRgba(value) : undefined;
			const [l, c, h] = parsed
				? rgbToOklch(parsed.r, parsed.g, parsed.b)
				: [0.5, 0, 0];
			colorSeed.push(l, c, h, parsed?.a ?? 1);
			colorOwned.set(`${n.id}:${paint}`, value !== undefined);
			pinnedHue.set(`${n.id}:${paint}`, parsed && c > 0.02 ? h : undefined);
		}
	}
	const colorBase = (
		rec: NodeRecord,
		paint: Paint = defaultPaint(rec),
	): number => {
		const i = nodeIndex.get(rec.id);
		if (i === undefined) throw new Error(`Unknown id ${rec.id}`);
		return i * COLOR_SLOTS * 2 + (paint === "stroke" ? COLOR_SLOTS : 0);
	};

	// Which relation each operator came from, for the post-solve check
	const descName = (d: Desc): string => {
		const owner =
			"container" in d
				? d.container
				: "box" in d
					? d.box
					: "line" in d
						? d.line
						: undefined;
		return owner
			? `${d.kind}(${owner.id})`
			: `${d.kind}(${d.children.map((c) => c.id).join(", ")})`;
	};

	// Ownership: axes positioned by a relation (hard) or user props (soft).
	// The first owned child of a relation becomes its anchor and is never
	// moved; writing an already hard-owned axis is an over-constraint.
	// Containers, background boxes, and lines get GUIDE ownership: their
	// derived positions make them anchor-eligible (Bluefish's fixed-element
	// and group-as-guide behavior) without triggering conflicts.
	type Ownership = {
		/** each hard-owned key and the desc that claimed it first */
		hard: Map<string, number>;
		guide: Set<string>;
	};
	type Compiled = {
		operators: LayoutOperator[];
		/** the keys this relation places on its children */
		claims: string[];
	};

	/**
	 * Compile relations in order against a fresh ownership. With `home`, they
	 * are a Modulate's: a child then only anchors when the author pinned it, an
	 * earlier relation of the same Modulate placed it, or a home relation that
	 * this one does not restate did.
	 */
	function compileDescs(
		indices: readonly number[],
		home?: Ownership,
		label = "",
	): { compiled: Map<number, Compiled>; ownership: Ownership } {
		const hard = new Map<string, number>();
		const guide = new Set<string>();
		const compiled = new Map<number, Compiled>();
		let current = 0;
		let out: Compiled = { operators: [], claims: [] };
		const push = (...operators: LayoutOperator[]) =>
			out.operators.push(...operators);
		const own = (key: string): void => {
			if (!hard.has(key)) hard.set(key, current);
			out.claims.push(key);
		};
		const ownSelf = (id: string): void => {
			for (const k of ["w", "h"])
				if (!hard.has(`${id}:${k}`)) hard.set(`${id}:${k}`, current);
			guide.add(`${id}:x`);
			guide.add(`${id}:y`);
		};

		function positionOwned(d: Desc, id: string, axis: "x" | "y"): boolean {
			const key = `${id}:${axis}`;
			if (hard.has(key) || userOwned.has(key)) return true;
			if (!home) return guide.has(key);
			const owner = home.hard.get(key);
			if (owner === undefined) return false;
			// A home relation over several of these children is being restated
			const theirs = new Set(descs[owner].children.map((c) => c.id));
			return d.children.filter((c) => theirs.has(c.id)).length === 1;
		}

		function anchorIndex(d: Desc, axis: "x" | "y"): number | null {
			for (let i = 0; i < d.children.length; i++) {
				if (positionOwned(d, d.children[i].id, axis)) return i;
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
				if (hard.has(key)) {
					warnings.push(
						`${label}${relation} conflicts with another relation over ${key}`,
					);
				}
				own(key);
			}
		}

		function extentOwnedOf(children: NodeRecord[], axis: "w" | "h"): boolean[] {
			return children.map((c) => {
				const key = `${c.id}:${axis}`;
				return hard.has(key) || userOwned.has(key) || !!home?.hard.has(key);
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
					if (!extentOwned[i]) own(`${c.id}:${axis}`);
				});
			} else if (spacing !== undefined || total !== undefined) {
				children.forEach((c, i) => {
					if (!extentOwned[i]) {
						warnings.push(
							`${label}${relation}: ${axis === "w" ? "width" : "height"} of ${c.id} is not owned`,
						);
					}
				});
			}
		}

		function compile(d: Desc): void {
			if (d.kind === "stackV" || d.kind === "stackH") {
				const mainAxis = d.kind === "stackV" ? "y" : "x";
				const crossAxis = d.kind === "stackV" ? "x" : "y";
				const extentAxis = d.kind === "stackV" ? "h" : "w";
				const mainAnchor = anchorIndex(d, mainAxis);
				const crossAnchor = anchorIndex(d, crossAxis);
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
				ownSelf(d.container.id);
				const children = toSubtreeChildren(d.children);
				const containerIdx = baseOf(d.container);
				if (d.kind === "stackV") {
					push(
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
					push(
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
					const anchor = anchorIndex(d, axis) ?? 0;
					claim(d.children, axis, anchor, `align(${alignment})`);
					const children = toSubtreeChildren(d.children);
					if (axis === "x") {
						push(alignX(children, alignment as AlignmentX, anchor));
					} else {
						push(alignY(children, alignment as AlignmentY, anchor));
					}
				}
			} else if (d.kind === "distribute") {
				const spacing = d.props.spacing as number | undefined;
				const total = d.props.total as number | undefined;
				const exactMode = spacing !== undefined || total !== undefined;
				const extentAxis = d.axis === "x" ? "w" : "h";
				const anchor = anchorIndex(d, d.axis) ?? 0;
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
				if (d.axis === "x") push(distributeX(children, opts));
				else push(distributeY(children, opts));
			} else if (d.kind === "background") {
				// Default padding matches Bluefish
				const padding = (d.props.padding as number) ?? 10;
				const width = d.props.width as number | undefined;
				const height = d.props.height as number | undefined;
				const xOwned = d.children.map((c) => positionOwned(d, c.id, "x"));
				const yOwned = d.children.map((c) => positionOwned(d, c.id, "y"));
				push(
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
						if (!xOwned[i]) own(`${c.id}:x`);
					});
				}
				if (height !== undefined) {
					d.children.forEach((c, i) => {
						if (!yOwned[i]) own(`${c.id}:y`);
					});
				}
				ownSelf(d.box.id);
			} else if (d.kind === "span") {
				const [source, ...targets] = d.children;
				for (const target of targets) {
					const posKey = `${target.id}:${d.axis}`;
					const extentKey = `${target.id}:${d.axis === "x" ? "w" : "h"}`;
					if (hard.has(posKey) || hard.has(extentKey)) {
						warnings.push(
							`span conflicts with another relation over ${target.id}`,
						);
					}
					own(posKey);
					own(extentKey);
					push(
						spanOp(
							baseOf(source),
							{ base: baseOf(target), subtree: subtreeBases(target) },
							d.axis === "x",
						),
					);
				}
			} else if (d.kind === "line") {
				push(
					lineOp(
						baseOf(d.children[0]),
						baseOf(d.children[1]),
						baseOf(d.line),
						d.line.source,
						d.line.target,
					),
				);
				ownSelf(d.line.id);
			} else if (d.kind === "distinctColors") {
				const keys = d.children.map((c, i) => `${c.id}:${d.paints[i]}`);
				const owned = keys.map((k) => colorOwned.get(k) ?? false);
				// `saturation` predates OKLCH; it scales to a comparable chroma
				const saturation = d.props.saturation as number | undefined;
				colorOps.push(
					distinctColorsOp(
						d.children.map((c, i) => colorBase(c, d.paints[i])),
						{
							lightness: (d.props.lightness as number) ?? 0.7,
							chroma:
								(d.props.chroma as number | undefined) ??
								(saturation !== undefined ? saturation * 0.25 : 0.14),
							startHue: (d.props.startHue as number) ?? 30,
							pinned: keys.map((k, i) =>
								owned[i] ? pinnedHue.get(k) : undefined,
							),
							owned,
						},
					),
				);
				keys.forEach((k, i) => {
					if (!owned[i]) coloredPaints.add(k);
				});
			} else if (d.kind === "sameColor" || d.kind === "shade") {
				const [source, ...targets] = d.children;
				const [sourcePaint, ...targetPaints] = d.paints;
				const targetBases = targets.map((t, i) =>
					colorBase(t, targetPaints[i]),
				);
				colorOps.push(
					d.kind === "sameColor"
						? sameColorOp(colorBase(source, sourcePaint), targetBases)
						: shadeColorOp(
								colorBase(source, sourcePaint),
								targetBases,
								d.delta,
							),
				);
				targets.forEach((t, i) => {
					coloredPaints.add(`${t.id}:${targetPaints[i]}`);
				});
			} else if (d.kind === "contrast") {
				const [fg, bg] = d.children;
				colorOps.push(
					contrastOp(
						colorBase(fg, d.paints[0]),
						colorBase(bg, d.paints[1]),
						(d.props.ratio as number) ?? 4.5,
					),
				);
				coloredPaints.add(`${fg.id}:${d.paints[0]}`);
			} else if (d.kind === "union") {
				push(
					unionOp(
						d.children.map((c) => baseOf(c)),
						baseOf(d.container),
					),
				);
				ownSelf(d.container.id);
			}
		}

		for (const i of indices) {
			current = i;
			out = { operators: [], claims: [] };
			compile(descs[i]);
			compiled.set(i, out);
			while (colorOpNames.length < colorOps.length)
				colorOpNames.push(descName(descs[i]));
		}
		return { compiled, ownership: { hard, guide } };
	}

	// Home is every relation outside a Modulate. A relation inside one holds
	// only while its Modulate does; until then its container rests on its members
	const colorOpNames: string[] = [];
	const all = descs.map((_, i) => i);
	const isHome = (i: number) =>
		descs[i].scope === undefined || descs[i].kind === "union";
	const home = compileDescs(all.filter(isHome));
	const modulated = new Map<string, Map<number, Compiled>>();
	for (const i of all) {
		const scope = descs[i].scope;
		if (isHome(i) || scope === undefined || modulated.has(scope)) continue;
		modulated.set(
			scope,
			compileDescs(
				all.filter((j) => !isHome(j) && descs[j].scope === scope),
				home.ownership,
				`Modulate(${scope}): `,
			).compiled,
		);
	}
	const rests = new Map<number, LayoutOperator | undefined>();
	const restOf = (i: number): LayoutOperator | undefined => {
		if (rests.has(i)) return rests.get(i);
		const d = descs[i];
		const op =
			"container" in d
				? unionOp(
						d.children.map((c) => baseOf(c)),
						baseOf(d.container),
					)
				: undefined;
		rests.set(i, op);
		return op;
	};
	const restName = (i: number): string => {
		const d = descs[i];
		return "container" in d ? `union(${d.container.id})` : descName(d);
	};

	// A phase only solves what can matter in it: home, the active modulations,
	// and the containers of inactive ones that some relation reads. The other
	// inactive containers draw nothing and stay where home left them, so a
	// phase costs the same however many modulations the scene has
	const read = new Set(descs.flatMap((d) => d.children.map((c) => c.id)));
	const scoped = new Map<string, number[]>();
	const always: number[] = [];
	for (const i of all) {
		const d = descs[i];
		if (d.scope === undefined) {
			always.push(i);
			continue;
		}
		const list = scoped.get(d.scope);
		if (list) list.push(i);
		else scoped.set(d.scope, [i]);
		if ("container" in d && read.has(d.container.id)) always.push(i);
	}

	/**
	 * The relations that hold while `active` modulations do (later ones win,
	 * home loses). A relation is dropped whole once a stronger one places
	 * something it placed; what it no longer places stays where it was.
	 */
	const operatorsFor = (
		active: readonly string[],
	): { operators: LayoutOperator[]; names: string[] } => {
		const taken = new Set<string>();
		const live = new Map<number, Compiled>();
		const held =
			active.length === 0
				? all
				: [
						...new Set([
							...always,
							...active.flatMap((id) => scoped.get(id) ?? []),
						]),
					].sort((a, b) => a - b);
		const groups: Iterable<[number, Compiled | undefined]>[] = [
			...[...active].reverse().map((id) => modulated.get(id) ?? []),
			held.filter(isHome).map((i) => [i, home.compiled.get(i)]),
		];
		for (const group of groups) {
			const kept: Compiled[] = [];
			for (const [i, c] of group) {
				if (!c) continue;
				const kind = descs[i].kind;
				const yields =
					kind === "stackV" ||
					kind === "stackH" ||
					kind === "align" ||
					kind === "distribute" ||
					kind === "span";
				if (yields && c.claims.some((k) => taken.has(k))) continue;
				live.set(i, c);
				kept.push(c);
			}
			for (const c of kept) for (const k of c.claims) taken.add(k);
		}
		const operators: LayoutOperator[] = [];
		const names: string[] = [];
		for (const i of held) {
			const c = live.get(i);
			const rest = c ? undefined : restOf(i);
			for (const op of c?.operators ?? (rest ? [rest] : [])) {
				operators.push(op);
				names.push(c ? descName(descs[i]) : restName(i));
			}
		}
		return { operators, names };
	};
	const { operators: ops, names: opNames } = operatorsFor([]);
	const phaseCache = new Map<string, ReturnType<typeof operatorsFor>>();
	const phaseOperators = (active: readonly string[]) => {
		const key = active.join("\n");
		const known = phaseCache.get(key);
		if (known) return known;
		const built = operatorsFor(active);
		phaseCache.set(key, built);
		return built;
	};

	const time = buildTime(nodes, timeNodes);
	for (const n of nodes) {
		const clock = time.clockOf.get(n.id);
		if (clock !== undefined) n.clock = clock;
		const phrase = time.phrases.get(n.id);
		if (phrase) n.phrase = phrase;
	}

	return {
		nodes,
		operators: ops,
		operatorNames: opNames,
		colorOperators: colorOps,
		colorOperatorNames: colorOpNames,
		colorSeed,
		coloredPaints: [...coloredPaints],
		timeOperators: time.timeOperators,
		timeOperatorNames: time.timeOperatorNames,
		timeSeed: time.timeSeed,
		timedIds: time.timedIds,
		timeChecks: time.timeChecks,
		warnings: [
			...warnings,
			...scopeWarnings,
			...targetWarnings,
			...time.warnings,
		],
		...(modulated.size > 0 || nodes.some((n) => n.modulation)
			? { phaseOperators }
			: {}),
	};
}

/** Layout relations that the solved layout does not satisfy (fixed-point check). */
export function checkLayout(
	scene: {
		nodes: readonly NodeRecord[];
		operators: readonly LayoutOperator[];
		operatorNames?: readonly string[];
	},
	layout: Record<
		string,
		{ x: number; y: number; width: number; height: number }
	>,
): string[] {
	if (scene.operators.length === 0) return [];
	const values = new Float64Array(scene.nodes.length * 4);
	scene.nodes.forEach((n, i) => {
		const b = layout[n.id] ?? n;
		values.set([b.x, b.y, b.width, b.height], i * 4);
	});
	const names = unsettled(
		values,
		scene.operators,
		scene.operatorNames ?? [],
		1e-2,
	);
	return names.length > 0 ? [unsettledMessage("layout", names)] : [];
}

/** Color relations the solved colors do not satisfy (fixed-point check). */
export function checkColor(scene: JsonScene): string[] {
	if (scene.colorOperators.length === 0) return [];
	const names = unsettled(
		solveColors(scene),
		scene.colorOperators,
		scene.colorOperatorNames,
		1e-3,
		COLOR_ANGLES,
	);
	return names.length > 0 ? [unsettledMessage("colors", names)] : [];
}

/**
 * Problems with the layout in time: a phase whose relations do not hold, a
 * Travel aimed at something a modulation moves, and marks that modulations
 * in different time both move.
 */
export function checkPhases(
	scene: JsonScene,
	layout: Parameters<typeof checkTime>[1] &
		Record<string, LayoutBox & { phases?: Record<string, LayoutBox> }>,
): string[] {
	if (!scene.phaseOperators) return [];
	const clocks = foldPhases(scene.nodes, (id) => {
		const b = layout[id];
		if (b?.start === undefined) return undefined;
		return b.local ?? { start: b.start, duration: b.duration ?? 0 };
	});
	const byId = new Map(scene.nodes.map((n) => [n.id, n]));
	const nameOf = (id: string) =>
		`${byId.get(id)?.modulation?.kind === "resolve" ? "Resolve" : "Modulate"}(${id})`;
	const out: string[] = [];

	// What each event moves, in node order
	const movedBy = new Map<string, number[]>();
	scene.nodes.forEach((n, i) => {
		for (const event of Object.keys(layout[n.id]?.phases ?? {})) {
			const list = movedBy.get(event);
			if (list) list.push(i);
			else movedBy.set(event, [i]);
		}
	});
	const homeBoxes = new Float64Array(scene.nodes.length * 4);
	scene.nodes.forEach((n, i) => {
		const b = layout[n.id] ?? n;
		homeBoxes.set([b.x, b.y, b.width, b.height], i * 4);
	});

	const checked = new Set<string>([""]);
	// The first event of each clock to move a node
	const movers = new Map<string, string[]>();
	for (const { events } of clocks) {
		const shown = new Float64Array(homeBoxes);
		const moved = new Set<number>();
		for (const e of events) {
			for (const i of movedBy.get(e.id) ?? []) {
				const { id } = scene.nodes[i];
				const box = layout[id].phases?.[e.id] as LayoutBox;
				shown.set([box.x, box.y, box.width, box.height], i * 4);
				if (moved.has(i)) continue;
				moved.add(i);
				movers.set(id, [...(movers.get(id) ?? []), e.id]);
			}
			const key = e.active.join("\n");
			if (checked.has(key)) continue;
			checked.add(key);
			const { operators, names } = scene.phaseOperators(e.active);
			const failing = unsettled(shown, operators, names, 1e-2);
			if (failing.length > 0)
				out.push(
					`after ${nameOf(e.id)}: ${unsettledMessage("layout", failing)}`,
				);
		}
	}

	for (const n of scene.nodes) {
		if (n.motion?.kind !== "travel") continue;
		const aims = [...(n.targets ?? []).map((t) => t.id), ...n.motion.via];
		const moving = aims.find((id) => movers.has(id));
		if (moving !== undefined)
			out.push(
				`Travel(${n.id}) aims at ${moving}'s home position, which ${nameOf(movers.get(moving)?.[0] ?? "")} moves`,
			);
	}

	const pairs = new Set<string>();
	for (const [id, [a, b]] of movers) {
		const type = byId.get(id)?.type;
		if (b === undefined || !type || type === "motion" || type === "timing")
			continue;
		if (pairs.has(`${a}\n${b}`)) continue;
		pairs.add(`${a}\n${b}`);
		out.push(
			`${nameOf(a)} and ${nameOf(b)} play in different time and both move ${id}; their moves add up`,
		);
	}
	return out;
}

/** Everything wrong with a solution: unsatisfied layout, color and time relations, schedule checks. */
export function checkSolution(
	scene: JsonScene,
	layout: Parameters<typeof checkLayout>[1] & Parameters<typeof checkPhases>[1],
): string[] {
	return [
		...checkLayout(scene, layout),
		...checkPhases(scene, layout),
		...checkColor(scene),
		...checkTime(scene, layout),
	];
}
