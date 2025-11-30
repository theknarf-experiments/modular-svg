import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import type {
	LayoutOperator,
	NodeRecord,
	StackAlignment,
	StackChild,
} from "./solver/operators";
import {
	alignXCenter,
	alignXCenterTo,
	alignXLeft,
	alignXRight,
	alignYBottom,
	alignYCenter,
	alignYTop,
	backgroundOp,
	distributeX,
	distributeY,
	stackH,
	stackV,
} from "./solver/operators";

export type JsonScene = { nodes: NodeRecord[]; operators: LayoutOperator[] };
type AnyNode = {
	type: string;
	id?: string;
	key?: string;
	props?: Record<string, unknown>;
	children?: AnyNode[];
	target?: string;
};

const schemaPath = join(
	dirname(fileURLToPath(import.meta.url)),
	"scene.schema.json",
);
const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
const ajv = new Ajv();
const validateFn = ajv.compile(schema);

export function validate(data: unknown): void {
	if (!validateFn(data)) {
		const msg = ajv.errorsText(validateFn.errors) || "invalid scene";
		throw new Error(msg);
	}
}

export function buildSceneFromJson(json: Record<string, unknown>): JsonScene {
	const nodes: NodeRecord[] = [];
	const nodeMap = new Map<string, NodeRecord>();
	const usedIds = new Set<string>();
	type Desc =
		| {
				kind: "stackV" | "stackH";
				container: NodeRecord;
				children: NodeRecord[];
				props: Record<string, unknown>;
		  }
		| { kind: "align"; axis: "x" | "y"; align: string; children: NodeRecord[] }
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
		  };
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
		if (n.type === "Rect") {
			const props = (n.props ?? {}) as Record<string, unknown>;
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
			const props = (n.props ?? {}) as Record<string, unknown>;
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
			const props = (n.props ?? {}) as Record<string, unknown>;
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
			const props = (n.props ?? {}) as Record<string, unknown>;
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
			const props = (n.props ?? {}) as Record<string, unknown>;
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
					axis:
						(node.props?.axis as "x" | "y") ??
						(node.props?.direction as "x" | "y") ??
						"x",
					align:
						(node.props?.alignment as string) ??
						(node.props?.type as string) ??
						"left",
					children,
				});
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
			} else if (node.type === "Background" && children[0]) {
				descs.push({
					kind: "background",
					box: rec,
					child: children[0],
					padding: (node.props?.padding as number) ?? 0,
				});
			} else if (node.type === "Arrow" && children.length >= 2) {
				(rec as NodeRecord).from = children[0].id;
				(rec as NodeRecord).to = children[1].id;
			}
		}
		return rec;
	}

	walk(json as AnyNode);

	const indexMap = new Map<string, number>();
	nodes.forEach((n, i) => indexMap.set(n.id, i * 4));

	const ops: LayoutOperator[] = [];
	for (const d of descs) {
		if (d.kind === "stackV" || d.kind === "stackH") {
			const childIndices: StackChild[] = d.children.map((c) => {
				const idx = indexMap.get(c.id);
				if (idx === undefined) throw new Error(`Unknown id ${c.id}`);
				return { base: idx, node: c };
			});
			const containerIdx = indexMap.get(d.container.id);
			if (containerIdx === undefined)
				throw new Error(`Unknown id ${d.container.id}`);
			if (d.kind === "stackV") {
				ops.push(
					stackV(
						childIndices,
						containerIdx,
						(d.props.spacing as number) ?? 0,
						(d.props.alignment as StackAlignment) ?? "left",
					),
				);
			} else {
				ops.push(
					stackH(
						childIndices,
						containerIdx,
						(d.props.spacing as number) ?? 0,
						(d.props.alignment as "top" | "centerY" | "bottom") ?? "top",
					),
				);
			}
		} else if (d.kind === "align") {
			if (d.axis === "x") {
				if (d.align === "left") {
					const xs = d.children.map((c) => {
						const idx = indexMap.get(c.id);
						if (idx === undefined) throw new Error(`Unknown id ${c.id}`);
						return idx;
					});
					ops.push(alignXLeft(xs));
				} else if (d.align === "center") {
					if (d.children.length >= 2) {
						const anchor = d.children[d.children.length - 1];
						const anchorBase = indexMap.get(anchor.id);
						if (anchorBase === undefined)
							throw new Error(`Unknown id ${anchor.id}`);
						const others = d.children.slice(0, -1).map((c) => {
							const base = indexMap.get(c.id);
							if (base === undefined) throw new Error(`Unknown id ${c.id}`);
							return { xIndex: base, widthIndex: base + 2 };
						});
						ops.push(
							alignXCenterTo(
								{ xIndex: anchorBase, widthIndex: anchorBase + 2 },
								others,
							),
						);
					} else {
						const arr = d.children.map((c) => {
							const base = indexMap.get(c.id);
							if (base === undefined) throw new Error(`Unknown id ${c.id}`);
							return { xIndex: base, widthIndex: base + 2 };
						});
						ops.push(alignXCenter(arr));
					}
				} else if (d.align === "right") {
					const arr = d.children.map((c) => {
						const base = indexMap.get(c.id);
						if (base === undefined) throw new Error(`Unknown id ${c.id}`);
						return { xIndex: base, widthIndex: base + 2 };
					});
					ops.push(alignXRight(arr));
				}
			} else {
				if (d.align === "top") {
					const ys = d.children.map((c) => {
						const idx = indexMap.get(c.id);
						if (idx === undefined) throw new Error(`Unknown id ${c.id}`);
						return idx + 1;
					});
					ops.push(alignYTop(ys));
				} else if (d.align === "center") {
					const arr = d.children.map((c) => {
						const base = indexMap.get(c.id);
						if (base === undefined) throw new Error(`Unknown id ${c.id}`);
						return { yIndex: base + 1, heightIndex: base + 3 };
					});
					ops.push(alignYCenter(arr));
				} else if (d.align === "bottom") {
					const arr = d.children.map((c) => {
						const base = indexMap.get(c.id);
						if (base === undefined) throw new Error(`Unknown id ${c.id}`);
						return { yIndex: base + 1, heightIndex: base + 3 };
					});
					ops.push(alignYBottom(arr));
				}
			}
		} else if (d.kind === "distribute") {
			const idxs = d.children.map((c) => {
				const idx = indexMap.get(c.id);
				if (idx === undefined) throw new Error(`Unknown id ${c.id}`);
				return d.axis === "x" ? idx : idx + 1;
			});
			const spacing = (d.props.spacing as number | undefined) ?? 0;
			if (d.axis === "x") ops.push(distributeX(idxs, spacing));
			else ops.push(distributeY(idxs, spacing));
		} else if (d.kind === "background") {
			const childBase = indexMap.get(d.child.id);
			const boxBase = indexMap.get(d.box.id);
			if (childBase === undefined || boxBase === undefined)
				throw new Error("unknown id in background");
			ops.push(backgroundOp(childBase, boxBase, d.padding));
		}
	}

	return { nodes, operators: ops };
}
