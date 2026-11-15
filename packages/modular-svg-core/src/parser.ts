import { parseRgba, rgbToOklch } from "./color.ts";
import {
	type Ease,
	easeProblems,
	easeStrays,
	namedChannels,
} from "./motion.ts";
import { flattenPath } from "./route.ts";
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
	clipOp,
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
	type TimeViews,
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
	/** spans a phrase's content reads from the time around it */
	timeViews?: TimeViews;
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
	/**
	 * Boxes of a Modulate's relations that nothing at home reads: each rests on
	 * its members, written once after home is solved
	 */
	restOperators?: LayoutOperator[];
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

/** What a Travel's props and route marks say that it cannot do. */
function travelWarnings(
	id: string,
	props: Record<string, unknown>,
	via: readonly NodeRecord[],
): string[] {
	const out: string[] = [];
	const name = `Travel(${id})`;
	const { route, pace, orient } = props;
	if (
		route !== undefined &&
		!["straight", "smooth", "along"].includes(route as string)
	)
		out.push(
			`${name}: route must be "straight", "smooth" or "along", got ${JSON.stringify(route)}`,
		);
	if (pace !== undefined && pace !== "leg" && pace !== "trip")
		out.push(
			`${name}: pace must be "leg" or "trip", got ${JSON.stringify(pace)}`,
		);
	if (
		orient !== undefined &&
		typeof orient !== "boolean" &&
		!(typeof orient === "number" && Number.isFinite(orient))
	)
		out.push(
			`${name}: orient must be true or an angle in degrees, got ${JSON.stringify(orient)}`,
		);
	if (route !== "along") return out;
	if (pace === "leg")
		out.push(
			`${name}: a route along marks has no legs, so pace="leg" is read as "trip"`,
		);
	for (const mark of via) {
		if (mark.type === "path") {
			const { unread, points } = flattenPath(mark.d ?? "");
			if (points.length === 0)
				out.push(
					`${name} cannot follow ${mark.id}: its path draws nothing, so it is passed through its centre`,
				);
			if (unread.includes("M"))
				out.push(`${name} follows only the first subpath of ${mark.id}`);
			if (unread.includes("A"))
				out.push(
					`${name}: ${mark.id} draws an arc (A), which is followed as a straight line; use C or an Arc`,
				);
		} else if (!["line", "curve", "arrow", "arc"].includes(mark.type ?? "")) {
			const kind = mark.type ?? "group";
			out.push(
				`${name} cannot follow ${mark.id}: ${/^[aeiou]/.test(kind) ? "an" : "a"} ${kind} has no path, so it is passed through its centre`,
			);
		}
	}
	return out;
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
		| {
				kind: "clip";
				container: NodeRecord;
				/** the shape first, then what shows inside it */
				children: NodeRecord[];
				inverse: boolean;
		  }
	) & {
		/** the Modulate this relation belongs to; absent for the home layout */
		scope?: string;
	};
	const descs: Desc[] = [];
	const scopeWarnings: string[] = [];
	// Every Clip and Mask with a shape and something to show, as walked
	const clips: {
		rec: NodeRecord;
		name: string;
		mask: boolean;
		props: Record<string, unknown>;
		shape: NodeRecord;
		content: NodeRecord[];
		desc: number;
	}[] = [];

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
	const MODULATED_TYPES = new Set([
		"StackV",
		"StackH",
		"Align",
		"Distribute",
		"Background",
		"Span",
	]);

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

	function ensureNode(n: AnyNode, path: string, scope?: string): NodeRecord {
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
		} else if (n.type === "Background" && scope === undefined) {
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
				// Walked all the same, so a later ref to it still resolves
				scopeWarnings.push(
					`Modulate(${scope}): ${node.type} cannot be modulated, so it is read as if declared outside; only StackV, StackH, Align, Distribute, Background and Span can`,
				);
				return walk(node, path, undefined);
			}
		}
		const rec = ensureNode(node, path, scope);
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
			} else if (node.type === "Clip" || node.type === "Mask") {
				const name = `${node.type}(${rec.id})`;
				const [shape, ...rest] = walked.filter((w) => spatial(w.rec));
				// What shows is one paint group, so it is declared here, not ref'd
				const content = rest
					.filter((w) => {
						if (w.child.type !== "Ref") return true;
						scopeWarnings.push(
							`${name} refs ${w.rec.id} after its shape; what a ${node.type.toLowerCase()} shows is declared inside it, so the ref is ignored`,
						);
						return false;
					})
					.map((w) => w.rec);
				if (!shape)
					scopeWarnings.push(
						`${name} has no shape: its first child is the shape, the rest is what shows inside it`,
					);
				else if (content.length === 0) {
					scopeWarnings.push(
						`${name} has a shape and nothing to show inside it`,
					);
					descs.push({ kind: "union", container: rec, children });
				} else {
					clips.push({
						rec,
						name,
						mask: node.type === "Mask",
						props: node.props ?? {},
						shape: shape.rec,
						content,
						desc: descs.length,
					});
					descs.push({
						kind: "clip",
						container: rec,
						children: [shape.rec, ...content],
						inverse: node.type === "Clip" && node.props?.inverse === true,
					});
				}
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
			} else if (node.type === "Background" && scope !== undefined) {
				// Restates a box that is already there: the first ref is the box,
				// the rest are what it wraps while the Modulate holds
				const [box, ...content] = children;
				const first = walked[0];
				if (first?.child.type !== "Ref" || first.rec.type !== "rect")
					scopeWarnings.push(
						`Modulate(${scope}): Background(${rec.id}) needs a ref to the Background or Rect it restates first, then refs to what that wraps`,
					);
				else if (content.length === 0)
					scopeWarnings.push(
						`Modulate(${scope}): Background(${rec.id}) restates ${box.id} around nothing; ref what it wraps after the box`,
					);
				else
					descs.push({
						kind: "background",
						box,
						children: content,
						props: node.props ?? {},
						scope,
					});
				if (children.length > 0)
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
					scope,
				});
				descs.push({ kind: "union", container: rec, children, scope });
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

	const parentOf = new Map<string, string>();
	for (const [parent, members] of structuralChildren)
		for (const m of members) parentOf.set(m.id, parent);
	/** A node and the containers around it, innermost first. */
	const lineage = (id: string): string[] => {
		const out = [id];
		for (
			let p = parentOf.get(id);
			p !== undefined && out.length <= nodes.length;
			p = parentOf.get(p)
		)
			out.push(p);
		return out;
	};
	// A modulated stack packs from its own box. It joins the subtree of the
	// innermost container that holds all its members, so a relation that moves
	// that container while the stack holds carries the stack along
	for (const d of descs) {
		if (d.scope === undefined || !(d.kind === "stackV" || d.kind === "stackH"))
			continue;
		const [first, ...others] = d.children.map((c) => lineage(c.id).slice(1));
		const around = others.map((l) => new Set(l));
		const shared = first?.find((p) => around.every((l) => l.has(p)));
		if (shared === undefined || shared === d.container.id) continue;
		structuralChildren.get(shared)?.push(d.container);
		parentOf.set(d.container.id, shared);
	}

	const targetWarnings: string[] = [];
	// A motion animates the marks under each target (a container's descendants)
	const nodesUnder = (
		rec: NodeRecord,
		seen = new Set<string>(),
	): NodeRecord[] => {
		if (seen.has(rec.id)) return [];
		seen.add(rec.id);
		return [
			rec,
			...(structuralChildren.get(rec.id) ?? []).flatMap((c) =>
				nodesUnder(c, seen),
			),
		];
	};
	const isMark = (rec: NodeRecord): boolean =>
		!!rec.type && rec.type !== "motion" && rec.type !== "timing";
	// Clips and masks. A shape is plain marks that shape one clip; one that
	// cannot be read that way leaves its clip a Group
	const order = new Map(nodes.map((n, i) => [n.id, i]));
	clips.sort((a, b) => (order.get(a.rec.id) ?? 0) - (order.get(b.rec.id) ?? 0));
	const clipNames = new Map(clips.map((c) => [c.rec.id, c.name]));
	const unapplied = new Set<string>();
	for (const c of clips)
		for (const n of nodesUnder(c.shape)) {
			if (n.id === c.rec.id || !clipNames.has(n.id) || unapplied.has(n.id))
				continue;
			unapplied.add(n.id);
			targetWarnings.push(
				`${c.name}: its shape holds ${clipNames.get(n.id)}, which is not applied there; a shape is plain marks`,
			);
		}
	const shapedBy = new Map<string, string>();
	const applied = clips.filter((c) => {
		const kind = c.mask ? "mask" : "clip";
		const ignore = (why?: string): boolean => {
			if (why) targetWarnings.push(`${c.name}: ${why}`);
			const d = descs[c.desc];
			descs[c.desc] = {
				kind: "union",
				container: c.rec,
				children: d.children,
			};
			return false;
		};
		if (unapplied.has(c.rec.id)) return ignore();
		const under = nodesUnder(c.shape);
		if (under.some((n) => n.id === c.rec.id))
			return ignore(
				`its shape ${c.shape.id} holds the ${c.mask ? "Mask" : "Clip"} itself, so the ${kind} is ignored`,
			);
		const marks = under.filter(isMark);
		if (marks.length === 0)
			return ignore(
				`its shape ${c.shape.id} draws nothing, so the ${kind} is ignored`,
			);
		const taken = marks.find((m) => shapedBy.has(m.id));
		if (taken)
			return ignore(
				`${taken.id} already shapes ${clipNames.get(shapedBy.get(taken.id) ?? "")} and a mark shapes one ${kind}, so ${c.name} is ignored; give it a shape of its own and move both with one motion`,
			);
		for (const m of marks) shapedBy.set(m.id, c.rec.id);
		const { by, feather, inverse } = c.props;
		if (c.mask && by !== undefined && by !== "alpha" && by !== "luminance")
			targetWarnings.push(
				`${c.name}: by must be "alpha" or "luminance"; read as "alpha"`,
			);
		if (c.mask && inverse !== undefined && inverse !== false)
			targetWarnings.push(
				`${c.name}: inverse only applies to a Clip; paint the shape the other way round instead`,
			);
		const soft =
			feather === undefined ||
			(typeof feather === "number" && Number.isFinite(feather) && feather >= 0);
		if (!soft)
			targetWarnings.push(`${c.name}: feather must be 0 or more; read as 0`);
		c.rec.matte = {
			kind,
			// A clip's shape is painted white (on black, or the other way round)
			by: c.mask && by !== "luminance" ? "alpha" : "luminance",
			inverse: !c.mask && inverse === true,
			feather: soft && feather !== undefined ? (feather as number) : 0,
			shapes: marks.map((m) => m.id),
		};
		return true;
	});
	// Innermost wins: an inner clip is declared after the one around it
	for (const c of applied)
		for (const child of c.content)
			for (const n of nodesUnder(child)) n.within = c.rec.id;
	for (const c of applied) {
		const matte = c.rec.matte as NonNullable<NodeRecord["matte"]>;
		const paint = matte.inverse ? "black" : "white";
		for (const id of matte.shapes) {
			const mark = nodeMap.get(id) as NodeRecord;
			// Taken out of the clip that showed it, unless it was declared in this one
			if (mark.within !== undefined && !lineage(id).includes(c.rec.id))
				targetWarnings.push(
					`${c.name}: its shape ${id} is inside ${clipNames.get(mark.within)}, and a shape is not drawn, so ${id} no longer shows there; declare a second mark and Span or Align it`,
				);
			mark.shapes = c.rec.id;
			delete mark.within;
			if (matte.kind !== "clip") continue;
			// Cut by geometry: whatever the shape was painted with, it covers
			if (defaultPaint(mark) === "stroke") {
				mark.stroke = paint;
				if (mark.type === "arrow") mark.fill = paint;
			} else {
				mark.fill = paint;
				mark.stroke = "none";
				mark.strokeWidth = 0;
			}
		}
	}

	// What a camera frames reaches through refs as well: a relation over refs
	// is framed as the marks it relates
	const related = new Map(timeNodes.map((t) => [t.rec.id, t.children]));
	const reached = (rec: NodeRecord, seen: Set<string>): NodeRecord[] => {
		if (seen.has(rec.id) || rec.type === "motion" || rec.type === "timing")
			return [];
		seen.add(rec.id);
		// A clip is framed as what it shows, not as all it holds
		if (rec.matte) return [rec];
		return [
			rec,
			...(related.get(rec.id) ?? []).flatMap((c) => reached(c, seen)),
		];
	};
	// Cameras first: a motion on one moves the view
	for (const t of timeNodes) {
		if (t.type !== "Camera") continue;
		const seen = new Set<string>();
		const name = `Camera(${t.rec.id})`;
		const framed = t.children.filter((c) => {
			if (c.type !== "motion" && c.type !== "timing") return true;
			targetWarnings.push(
				`${name} frames ${c.id}, which takes no space; ref a mark or a group`,
			);
			return false;
		});
		const { fit } = t.props;
		if (fit !== undefined && fit !== "contain" && fit !== "cover")
			targetWarnings.push(
				`${name}: fit must be "contain" or "cover"; using contain`,
			);
		t.rec.camera = {
			frames: framed
				.flatMap((c) => reached(c, seen))
				.filter((n) => isMark(n) || !!n.matte)
				.map((n) => n.id),
			aimed: framed.length > 0,
			padding:
				typeof t.props.padding === "number" && Number.isFinite(t.props.padding)
					? t.props.padding
					: 0,
			fit: fit === "cover" ? "cover" : "contain",
			follow: t.props.follow === true,
			...(t.props.ease !== undefined ? { ease: t.props.ease as Ease } : {}),
		};
	}
	for (const t of timeNodes) {
		if (t.type === "Modulate" || t.type === "Resolve")
			t.rec.modulation = {
				kind: t.type === "Modulate" ? "modulate" : "resolve",
				releases: t.type === "Resolve" ? t.children.map((c) => c.id) : [],
				...(t.props.ease !== undefined ? { ease: t.props.ease as Ease } : {}),
			};
		const eases = [
			t.props.ease,
			...(Array.isArray(t.props.steps)
				? t.props.steps.map((s) => (s as { ease?: unknown } | null)?.ease)
				: []),
		];
		for (const problem of eases.flatMap((e) => [
			...easeProblems(e).map((p) => `${p}; using the nearest allowed value`),
			...easeStrays(e),
		]))
			targetWarnings.push(`${t.type}(${t.rec.id}): ${problem}`);
		if (t.rec.type !== "motion") continue;
		// Travel moves its first child through the rest, which stay put
		const travel = t.rec.motion?.kind === "travel";
		const [mover, ...via] = t.children;
		if (t.rec.motion?.kind === "travel" && mover) {
			t.rec.motion = { ...t.rec.motion, via: via.map((v) => v.id) };
			targetWarnings.push(...travelWarnings(t.rec.id, t.props, via));
		}
		t.rec.targets = (travel ? (mover ? [mover] : []) : t.children).map((c) => {
			const under = nodesUnder(c);
			return {
				id: c.id,
				marks: c.camera ? [c.id] : under.filter(isMark).map((n) => n.id),
				under: under.map((n) => n.id),
			};
		});
		if (t.children.length === 0)
			targetWarnings.push(`${t.type}(${t.rec.id}) has no target`);
		const paints = t.rec.motion
			? namedChannels(t.rec.motion).filter(
					(c) => c === "fill" || c === "stroke",
				)
			: [];
		// On the clip itself, or a group round it, the paint is for its content
		for (const id of new Set(
			paints.length > 0
				? t.rec.targets.flatMap((x) =>
						x.marks.filter(
							(m) => !x.under?.includes(nodeMap.get(m)?.shapes ?? ""),
						),
					)
				: [],
		)) {
			const clip = nodeMap.get(nodeMap.get(id)?.shapes ?? "");
			if (clip?.matte?.kind === "clip")
				targetWarnings.push(
					`${t.type}(${t.rec.id}) animates ${paints.join(" and ")} on ${id}, the shape of Clip(${clip.id}); a Clip is cut by geometry and ignores paint (use a Mask)`,
				);
		}
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

	/** A container's box from what it holds: all of it, or what a clip shows. */
	const boxOp = (d: Desc & { container: NodeRecord }): LayoutOperator => {
		const bases = d.children.map((c) => baseOf(c));
		return d.kind === "clip"
			? clipOp([bases[0]], bases.slice(1), baseOf(d.container), d.inverse)
			: unionOp(bases, baseOf(d.container));
	};

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

	/** Claimed by the relation that wraps a box, so a restated one replaces it. */
	const boxKey = (box: NodeRecord): string => `${box.id}:box`;

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
		/**
		 * for a Modulate's relation: the keys of containers it takes a member out
		 * of. A relation over such a container would drag the member along, or
		 * place the rest by a box that now reaches wherever the member went
		 */
		blocks: string[];
		/** the keys this relation places things by or on: its children's, per axis */
		reads: string[];
	};

	/**
	 * Compile relations in order against a fresh ownership. With `home`, they
	 * are a Modulate's: a child then only anchors when the author pinned it, an
	 * earlier relation of the same Modulate placed it, or a home relation that
	 * this one does not restate did. Next to such a child, the members of a
	 * restated relation anchor too, so whichever comes first stays.
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
		let out: Compiled = { operators: [], claims: [], blocks: [], reads: [] };
		const push = (...operators: LayoutOperator[]) =>
			out.operators.push(...operators);
		// `within`: what the relation places the key from. A container that holds
		// the placed node but not all of those cannot be moved without a fight
		const own = (key: string, within?: readonly string[]): void => {
			if (!hard.has(key)) hard.set(key, current);
			out.claims.push(key);
			if (!home || !within) return;
			const [id, axis] = [key.slice(0, key.lastIndexOf(":")), key.slice(-1)];
			const inside = within.map((w) => new Set(lineage(w)));
			for (const around of lineage(id).slice(1)) {
				if (inside.every((l) => l.has(around))) break;
				out.blocks.push(`${around}:${axis}`);
			}
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
			const owned = d.children.map((c) => positionOwned(d, c.id, axis));
			const first = owned.indexOf(true);
			if (first < 0) return null;
			if (!home) return first;
			// Something here stays put, so a restated member may be what stays
			const restated = d.children.findIndex(
				(c, i) => i < first && home.hard.has(`${c.id}:${axis}`),
			);
			return restated < 0 ? first : restated;
		}

		const reading = (children: NodeRecord[], ...axes: ("x" | "y")[]): void => {
			for (const c of children)
				for (const axis of axes) out.reads.push(`${c.id}:${axis}`);
		};

		function claim(
			children: NodeRecord[],
			axis: "x" | "y",
			skip: number | null,
			relation: string,
			from?: string,
		): void {
			const within =
				from !== undefined
					? [from]
					: skip !== null
						? [children[skip].id]
						: children.map((c) => c.id);
			for (let i = 0; i < children.length; i++) {
				if (i === skip) continue;
				const key = `${children[i].id}:${axis}`;
				if (hard.has(key)) {
					warnings.push(
						`${label}${relation} conflicts with another relation over ${key}`,
					);
				}
				own(key, within);
			}
		}

		// `assigns`: the relation sizes what nothing else has. A home relation
		// that it restates sized its members for home only, so those are free
		function extentOwnedOf(
			d: Desc,
			axis: "w" | "h",
			assigns: boolean,
		): boolean[] {
			return d.children.map((c) => {
				const key = `${c.id}:${axis}`;
				if (hard.has(key) || userOwned.has(key)) return true;
				const owner = home?.hard.get(key);
				if (owner === undefined) return false;
				if (!assigns) return true;
				const theirs = new Set(descs[owner].children.map((m) => m.id));
				return !(
					theirs.has(c.id) &&
					d.children.filter((m) => theirs.has(m.id)).length > 1
				);
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
				reading(d.children, "x", "y");
				// With no anchor the run is placed from the stack's own box
				const from = (anchor: number | null) =>
					anchor === null ? d.container.id : undefined;
				claim(
					d.children,
					mainAxis,
					mainAnchor,
					d.container.id,
					from(mainAnchor),
				);
				claim(
					d.children,
					crossAxis,
					crossAnchor,
					d.container.id,
					from(crossAnchor),
				);
				// Defaults match Bluefish: spacing 10 only when total is also unset
				const spacingProp = d.props.spacing as number | undefined;
				const total = d.props.total as number | undefined;
				const spacing =
					spacingProp === undefined && total === undefined ? 10 : spacingProp;
				const extentOwned = extentOwnedOf(
					d,
					extentAxis,
					spacing !== undefined && total !== undefined,
				);
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
					reading(d.children, axis);
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
				reading(d.children, d.axis);
				claim(d.children, d.axis, exactMode ? anchor : null, "distribute");
				const extentOwned = extentOwnedOf(
					d,
					extentAxis,
					spacing !== undefined && total !== undefined,
				);
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
						if (!xOwned[i]) own(`${c.id}:x`, [d.box.id]);
					});
				}
				if (height !== undefined) {
					d.children.forEach((c, i) => {
						if (!yOwned[i]) own(`${c.id}:y`, [d.box.id]);
					});
				}
				if (home) {
					// A restated box: the one that wrapped it before lets go
					const key = boxKey(d.box);
					if (hard.has(key))
						warnings.push(
							`${label}background(${d.box.id}) conflicts with another relation over ${d.box.id}`,
						);
					own(key);
					// Wrapping what it does not hold, it is placed by that alone
					const held = new Set(subtreeBases(d.box));
					if (d.children.some((c) => !held.has(baseOf(c))))
						for (const axis of ["x", "y"] as const)
							claim([d.box], axis, null, `background(${d.box.id})`, d.box.id);
				}
				ownSelf(d.box.id);
			} else if (d.kind === "span") {
				const [source, ...targets] = d.children;
				reading(d.children, d.axis);
				for (const target of targets) {
					const posKey = `${target.id}:${d.axis}`;
					const extentKey = `${target.id}:${d.axis === "x" ? "w" : "h"}`;
					if (hard.has(posKey) || hard.has(extentKey)) {
						warnings.push(
							`${label}span conflicts with another relation over ${target.id}`,
						);
					}
					own(posKey, [source.id]);
					own(extentKey);
					// A Modulate resizes a circle or arc, which is drawn round: its
					// other side follows unless a Span of this Modulate gives that too
					const other = d.axis === "x" ? "y" : "x";
					const round =
						!!home &&
						(target.type === "circle" || target.type === "arc") &&
						!indices.some((i) => {
							const s = descs[i];
							return (
								s.kind === "span" &&
								s.axis === other &&
								s.children.slice(1).includes(target)
							);
						});
					if (round) own(`${target.id}:${d.axis === "x" ? "h" : "w"}`);
					push(
						spanOp(
							baseOf(source),
							{ base: baseOf(target), subtree: subtreeBases(target) },
							d.axis === "x",
							round,
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
			} else if (d.kind === "union" || d.kind === "clip") {
				push(boxOp(d));
				ownSelf(d.container.id);
			}
		}

		for (const i of indices) {
			current = i;
			out = { operators: [], claims: [], blocks: [], reads: [] };
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
	// A restated box that wraps something a home stack still places beside it
	// pushes that away as it grows around it, forever
	const beside = new Map<string, number[]>();
	if (descs.some((d) => d.kind === "background" && d.scope !== undefined))
		for (const i of all) {
			const d = descs[i];
			const packs =
				d.kind === "stackV" || d.kind === "stackH" || d.kind === "distribute";
			if (d.scope !== undefined || !packs) continue;
			for (const c of d.children)
				beside.set(c.id, [...(beside.get(c.id) ?? []), i]);
		}
	for (const [scope, compiled] of modulated) {
		const claims = new Set([...compiled.values()].flatMap((c) => c.claims));
		const blocks = new Set([...compiled.values()].flatMap((c) => c.blocks));
		const holds = (r: number): boolean => {
			const c = home.compiled.get(r);
			return (
				!c?.claims.some((k) => claims.has(k)) &&
				!c?.reads.some((k) => blocks.has(k))
			);
		};
		for (const i of compiled.keys()) {
			const d = descs[i];
			if (d.kind !== "background") continue;
			const held = new Set(subtreeBases(d.box));
			for (const member of d.children) {
				if (held.has(baseOf(member))) continue;
				const theirs = new Set(lineage(member.id));
				for (const x of lineage(d.box.id)) {
					const r = (beside.get(x) ?? []).find(
						(r) =>
							holds(r) &&
							descs[r].children.some((y) => y.id !== x && theirs.has(y.id)),
					);
					if (r === undefined) continue;
					warnings.push(
						`Modulate(${scope}): background(${d.box.id}) now wraps ${member.id}, which ${descName(descs[r])} places beside ${x}; restate that relation inside the Modulate`,
					);
					break;
				}
			}
		}
	}
	const rests = new Map<number, LayoutOperator | undefined>();
	const restOf = (i: number): LayoutOperator | undefined => {
		if (rests.has(i)) return rests.get(i);
		const d = descs[i];
		const op = "container" in d ? boxOp(d) : undefined;
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
	// Home solves exactly what the scene without its Modulates would: of their
	// containers only those a home relation reads, and what those read in turn
	const readAtHome = new Set<string>();
	for (const d of [...descs].reverse())
		if (
			d.scope === undefined ||
			("container" in d && readAtHome.has(d.container.id))
		)
			for (const c of d.children) readAtHome.add(c.id);
	const atHome = (i: number): boolean => {
		const d = descs[i];
		return (
			d.scope === undefined ||
			("container" in d && readAtHome.has(d.container.id))
		);
	};
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
	 * something it placed, or a container it reached into; what it no longer
	 * places stays where it was.
	 */
	const operatorsFor = (
		active: readonly string[],
	): { operators: LayoutOperator[]; names: string[] } => {
		const taken = new Set<string>();
		const blocked = new Set<string>();
		const live = new Map<number, Compiled>();
		const held =
			active.length === 0
				? all.filter(atHome)
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
				const d = descs[i];
				// A box yields to whatever restates it, a placement to whatever
				// places the same thing, takes a member out of what it places, or
				// places a container it took a member out of itself
				const yields =
					d.kind === "background"
						? taken.has(boxKey(d.box))
						: (d.kind === "stackV" ||
								d.kind === "stackH" ||
								d.kind === "align" ||
								d.kind === "distribute" ||
								d.kind === "span") &&
							(c.claims.some((k) => taken.has(k)) ||
								c.blocks.some((k) => taken.has(k)) ||
								(blocked.size > 0 && c.reads.some((k) => blocked.has(k))));
				if (yields) continue;
				live.set(i, c);
				kept.push(c);
			}
			for (const c of kept) {
				for (const k of c.claims) taken.add(k);
				for (const k of c.blocks) blocked.add(k);
			}
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
	const restOperators = all.flatMap((i) => {
		const rest = atHome(i) ? undefined : restOf(i);
		return rest ? [rest] : [];
	});
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
		timeViews: time.timeViews,
		warnings: [
			...warnings,
			...scopeWarnings,
			...targetWarnings,
			...time.warnings,
		],
		...(modulated.size > 0 || nodes.some((n) => n.modulation)
			? { phaseOperators }
			: {}),
		...(restOperators.length > 0 ? { restOperators } : {}),
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
	// What a clock shows, and the copy the check works in: both are put back
	// to home after each clock, so a clock costs what it moves
	const shown = new Float64Array(homeBoxes);
	const mirror = new Float64Array(homeBoxes);
	const show = (i: number, box: LayoutBox): void => {
		const at = [box.x, box.y, box.width, box.height];
		shown.set(at, i * 4);
		mirror.set(at, i * 4);
	};
	for (const { events } of clocks) {
		const moved = new Set<number>();
		for (const e of events) {
			for (const i of movedBy.get(e.id) ?? []) {
				const { id } = scene.nodes[i];
				show(i, layout[id].phases?.[e.id] as LayoutBox);
				if (moved.has(i)) continue;
				moved.add(i);
				movers.set(id, [...(movers.get(id) ?? []), e.id]);
			}
			const key = e.active.join("\n");
			if (checked.has(key)) continue;
			checked.add(key);
			const { operators, names } = scene.phaseOperators(e.active);
			const failing = unsettled(
				shown,
				operators,
				names,
				1e-2,
				undefined,
				mirror,
			);
			if (failing.length > 0)
				out.push(
					`after ${nameOf(e.id)}: ${unsettledMessage("layout", failing)}`,
				);
		}
		for (const i of moved) {
			const { id } = scene.nodes[i];
			show(i, layout[id] ?? scene.nodes[i]);
		}
	}

	for (const n of scene.nodes) {
		if (n.motion?.kind !== "travel") continue;
		// A route along a connector also rests on where that connector's ends are
		const ends =
			n.motion.route === "along"
				? n.motion.via.flatMap((id) => {
						const mark = byId.get(id);
						return [mark?.from, mark?.to].filter((e) => e !== undefined);
					})
				: [];
		const aims = [
			...(n.targets ?? []).map((t) => t.id),
			...n.motion.via,
			...ends,
		];
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

/** The marks a camera frames at home, strokes included; undefined when there are none. */
export function framedBox(
	frames: readonly string[],
	boxOf: (id: string) => LayoutBox | undefined,
	byId: ReadonlyMap<string, NodeRecord>,
): LayoutBox | undefined {
	let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
	for (const id of frames) {
		const box = boxOf(id);
		if (!box) continue;
		const grow = strokeOf(byId.get(id)) / 2;
		left = Math.min(left, box.x - grow);
		top = Math.min(top, box.y - grow);
		right = Math.max(right, box.x + box.width + grow);
		bottom = Math.max(bottom, box.y + box.height + grow);
	}
	return left <= right
		? { x: left, y: top, width: right - left, height: bottom - top }
		: undefined;
}

/** The stroke a mark's box grows by, as the canvas bounds count it. */
export const strokeOf = (n: NodeRecord | undefined): number =>
	n?.strokeWidth ?? (n?.type === "arrow" ? 3 : 0);

/** Cameras that have something to frame and frame nothing. */
export function checkCamera(
	scene: { nodes: readonly NodeRecord[] },
	layout: Record<string, LayoutBox>,
): string[] {
	const byId = new Map(scene.nodes.map((n) => [n.id, n]));
	return scene.nodes.flatMap((n) => {
		if (!n.camera?.aimed) return [];
		const box = framedBox(n.camera.frames, (id) => layout[id], byId);
		const pad = n.camera.padding * 2;
		return box && (box.width + pad > 0 || box.height + pad > 0)
			? []
			: [`Camera(${n.id}) frames an empty box; showing everything instead`];
	});
}

/** Clips whose shape is closed at rest: a render without animation shows nothing in them. */
export function checkClips(
	scene: { nodes: readonly NodeRecord[] },
	layout: Record<string, LayoutBox>,
): string[] {
	const byId = new Map(scene.nodes.map((n) => [n.id, n]));
	return scene.nodes.flatMap((n) => {
		if (!n.matte || n.matte.inverse) return [];
		const open = n.matte.shapes.some((id) => {
			const [mark, box] = [byId.get(id), layout[id]];
			if (!mark || !box) return false;
			// A connector is a stroke: it covers along its length
			return defaultPaint(mark) === "stroke"
				? box.width + box.height > 0
				: box.width > 0 && box.height > 0;
		});
		return open
			? []
			: [
					`${n.matte.kind === "mask" ? "Mask" : "Clip"}(${n.id}): its shape has no area at rest, so a render without animation shows nothing inside it; let the shape rest open and give the motion a from`,
				];
	});
}

/** Everything wrong with a solution: unsatisfied layout, color and time relations, schedule checks. */
export function checkSolution(
	scene: JsonScene,
	layout: Parameters<typeof checkLayout>[1] & Parameters<typeof checkPhases>[1],
): string[] {
	return [
		...checkLayout(scene, layout),
		...checkPhases(scene, layout),
		...checkCamera(scene, layout),
		...checkClips(scene, layout),
		...checkColor(scene),
		...checkTime(scene, layout),
	];
}
