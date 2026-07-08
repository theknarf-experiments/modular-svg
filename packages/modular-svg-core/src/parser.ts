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
	distributeX,
	distributeY,
	stackH,
	stackV,
	unionOp,
} from "./solver/operators.ts";

export type JsonScene = {
	nodes: NodeRecord[];
	operators: LayoutOperator[];
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

// Schema validation (Node.js only)
let validateFn: ((data: unknown) => boolean) | undefined;

// Lazy load validation only in Node.js environment
async function getValidator() {
	if (validateFn) return validateFn;

	// Skip validation in browser
	if (typeof globalThis !== "undefined" && "window" in globalThis) {
		return undefined;
	}

	// Dynamic import for Node.js-only modules
	const { readFileSync } = await import("node:fs");
	const { dirname, join } = await import("node:path");
	const { fileURLToPath } = await import("node:url");
	const Ajv = (await import("ajv")).default;

	const schemaPath = join(
		dirname(fileURLToPath(import.meta.url)),
		"scene.schema.json",
	);
	const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
	const ajv = new Ajv();
	validateFn = ajv.compile(schema);
	return validateFn;
}

export async function validate(data: unknown): Promise<void> {
	const validator = await getValidator();
	if (!validator) {
		// Skip validation in browser
		return;
	}

	if (!validator(data)) {
		// Access Ajv instance to get errors - this is Node-only
		const Ajv = (await import("ajv")).default;
		const ajv = new Ajv();
		const tempValidator = ajv.compile(
			(await import("./scene.schema.json", { with: { type: "json" } })).default,
		);
		tempValidator(data);
		const msg = ajv.errorsText(tempValidator.errors) || "invalid scene";
		throw new Error(msg);
	}
}

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
				child: NodeRecord;
				padding: number;
		  }
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
		if (n.type === "Rect") {
			rec = {
				id: nodeId,
				type: "rect",
				x: (props.x as number | undefined) ?? 0,
				y: (props.y as number | undefined) ?? 0,
				width: (props.width as number | undefined) ?? 0,
				height: (props.height as number | undefined) ?? 0,
				fill: props.fill as string | undefined,
				stroke: props.stroke as string | undefined,
				strokeWidth: (props["stroke-width"] as number | undefined) ?? 3,
			};
		} else if (n.type === "Background") {
			rec = {
				id: nodeId,
				type: "rect",
				x: 0,
				y: 0,
				width: 0,
				height: 0,
				fill: props.fill as string | undefined,
				stroke: props.stroke as string | undefined,
				strokeWidth: (props["stroke-width"] as number | undefined) ?? 3,
			};
		} else if (n.type === "Circle") {
			const r = (props.r as number | undefined) ?? 0;
			rec = {
				id: nodeId,
				type: "circle",
				r,
				x: (props.x as number | undefined) ?? 0,
				y: (props.y as number | undefined) ?? 0,
				width: r * 2,
				height: r * 2,
				fill: props.fill as string | undefined,
				stroke: props.stroke as string | undefined,
				strokeWidth: (props["stroke-width"] as number | undefined) ?? 1,
			};
		} else if (n.type === "Text") {
			rec = {
				id: nodeId,
				type: "text",
				text: (props.text as string | undefined) ?? "",
				x: (props.x as number | undefined) ?? 0,
				y: (props.y as number | undefined) ?? 0,
				width:
					(props.width as number | undefined) ??
					((props.text as string | undefined)?.length ?? 0) * 8,
				height: (props.height as number | undefined) ?? 16,
				fill: (props.fill as string | undefined) ?? "black",
				stroke: props.stroke as string | undefined,
				strokeWidth: props["stroke-width"] as number | undefined,
			};
		} else if (n.type === "Arrow") {
			rec = {
				id: nodeId,
				type: "arrow",
				x: 0,
				y: 0,
				width: 0,
				height: 0,
				fill: props.fill as string | undefined,
				stroke: props.stroke as string | undefined,
				strokeWidth: (props["stroke-width"] as number | undefined) ?? 3,
			};
		} else {
			rec = { id: nodeId, x: 0, y: 0, width: 0, height: 0 };
		}
		if (n.type === "Rect" || n.type === "Circle" || n.type === "Text") {
			if (props.x !== undefined) userOwned.add(`${nodeId}:x`);
			if (props.y !== undefined) userOwned.add(`${nodeId}:y`);
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
				descs.push({
					kind: "distribute",
					axis:
						(node.props?.axis as "x" | "y") ??
						(node.props?.direction as "x" | "y") ??
						"x",
					children,
					props: node.props ?? {},
				});
				descs.push({ kind: "union", container: rec, children });
			} else if (node.type === "Background" && children[0]) {
				descs.push({
					kind: "background",
					box: rec,
					child: children[0],
					// Default padding matches Bluefish
					padding: (node.props?.padding as number) ?? 10,
				});
			} else if (node.type === "Arrow" && children.length >= 2) {
				(rec as NodeRecord).from = children[0].id;
				(rec as NodeRecord).to = children[1].id;
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
	const hardOwned = new Set<string>();
	const warnings: string[] = [];

	function anchorIndex(children: NodeRecord[], axis: "x" | "y"): number | null {
		for (let i = 0; i < children.length; i++) {
			const key = `${children[i].id}:${axis}`;
			if (hardOwned.has(key) || userOwned.has(key)) return i;
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

	const ops: LayoutOperator[] = [];
	for (const d of descs) {
		if (d.kind === "stackV" || d.kind === "stackH") {
			const mainAxis = d.kind === "stackV" ? "y" : "x";
			const crossAxis = d.kind === "stackV" ? "x" : "y";
			const mainAnchor = anchorIndex(d.children, mainAxis);
			const crossAnchor = anchorIndex(d.children, crossAxis);
			claim(d.children, mainAxis, mainAnchor, d.container.id);
			claim(d.children, crossAxis, crossAnchor, d.container.id);
			const children = toSubtreeChildren(d.children);
			const containerIdx = baseOf(d.container);
			// Defaults match Bluefish: spacing 10, centered cross-axis alignment
			const spacing = (d.props.spacing as number) ?? 10;
			if (d.kind === "stackV") {
				ops.push(
					stackV(
						children,
						containerIdx,
						spacing,
						(d.props.alignment as AlignmentX) ?? "centerX",
						mainAnchor,
						crossAnchor,
					),
				);
			} else {
				ops.push(
					stackH(
						children,
						containerIdx,
						spacing,
						(d.props.alignment as AlignmentY) ?? "centerY",
						mainAnchor,
						crossAnchor,
					),
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
			const spacing = (d.props.spacing as number | undefined) ?? 0;
			const anchor = anchorIndex(d.children, d.axis) ?? 0;
			claim(d.children, d.axis, spacing > 0 ? anchor : null, "distribute");
			const children = toSubtreeChildren(d.children);
			if (d.axis === "x") ops.push(distributeX(children, spacing, anchor));
			else ops.push(distributeY(children, spacing, anchor));
		} else if (d.kind === "background") {
			ops.push(backgroundOp(baseOf(d.child), baseOf(d.box), d.padding));
		} else if (d.kind === "union") {
			ops.push(
				unionOp(
					d.children.map((c) => baseOf(c)),
					baseOf(d.container),
				),
			);
		}
	}

	return { nodes, operators: ops, warnings };
}
