// Helper functions to build JSON scene descriptions in a Bluefish-like style
import { buildSceneFromJson, layoutToSvg, solveLayout } from "./index";

let counter = 0;
function uid(prefix: string): string {
	counter += 1;
	return `${prefix}${counter}`;
}

export type SceneNode = {
	type: string;
	id?: string;
	props?: Record<string, unknown>;
	children?: SceneNode[];
	target?: string;
};

export function Bluefish(...children: SceneNode[]): SceneNode {
	return { type: "Group", id: "scene", children };
}

export function Background(
	props: Record<string, unknown> = {},
	child?: SceneNode,
): SceneNode {
	const { name, padding, ...rest } = props as {
		name?: string;
		padding?: number;
	};
	return {
		type: "Background",
		id: (name as string) ?? uid("bg"),
		props: { padding, ...rest },
		children: child ? [child] : [],
	};
}

export function StackH(
	props: Record<string, unknown> = {},
	...children: SceneNode[]
): SceneNode {
	const { name, ...rest } = props as { name?: string };
	return {
		type: "StackH",
		id: (name as string) ?? uid("stackH"),
		props: rest,
		children,
	};
}

export function StackV(
	props: Record<string, unknown> = {},
	...children: SceneNode[]
): SceneNode {
	const { name, ...rest } = props as { name?: string };
	return {
		type: "StackV",
		id: (name as string) ?? uid("stackV"),
		props: rest,
		children,
	};
}

export function Circle(props: Record<string, unknown> = {}): SceneNode {
	const { name, ...rest } = props as { name?: string };
	return { type: "Circle", id: (name as string) ?? uid("circle"), props: rest };
}

export function Text(
	props: Record<string, unknown> = {},
	text = "",
): SceneNode {
	const { name, ...rest } = props as { name?: string };
	return {
		type: "Text",
		id: (name as string) ?? uid("text"),
		props: { ...rest, text },
	};
}

export function Ref(props: { select: string }): SceneNode {
	return { type: "Ref", target: props.select };
}

export function Distribute(
	props: Record<string, unknown> = {},
	...children: SceneNode[]
): SceneNode {
	const { name, direction, ...rest } = props as {
		name?: string;
		direction?: string;
	};
	const axisProp = (props as { axis?: string }).axis;
	const axis =
		direction === "vertical"
			? "y"
			: direction === "horizontal"
				? "x"
				: axisProp;
	return {
		type: "Distribute",
		id: (name as string) ?? uid("dist"),
		props: { axis, ...rest },
		children,
	};
}

export function Align(
	props: Record<string, unknown> = {},
	...children: SceneNode[]
): SceneNode {
	const { name, alignment, ...rest } = props as {
		name?: string;
		alignment?: string;
	};
	let axis = (props as { axis?: string }).axis;
	let align = alignment;
	if (!axis && typeof alignment === "string") {
		if (alignment.endsWith("X")) {
			axis = "x";
			align = alignment.slice(0, -1);
		} else if (alignment.endsWith("Y")) {
			axis = "y";
			align = alignment.slice(0, -1);
		}
	}
	return {
		type: "Align",
		id: (name as string) ?? uid("align"),
		props: { axis, alignment: align, ...rest },
		children,
	};
}

export function Arrow(from: SceneNode, to: SceneNode): SceneNode {
	return { type: "Arrow", id: uid("arrow"), children: [from, to] };
}

export function render(node: SceneNode): string {
	const scene = buildSceneFromJson(node as unknown as Record<string, unknown>);
	const layout = solveLayout(scene);
	return layoutToSvg(layout, scene.nodes);
}
