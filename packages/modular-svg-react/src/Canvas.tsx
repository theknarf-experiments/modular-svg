import {
	layoutToAst,
	type SvgDocument,
	type SvgElement,
	solveLayout,
} from "@modular-svg/core";
import * as React from "react";
import {
	createRoot,
	getEventHandlers,
	type ReconcilerRoot,
} from "./reconciler";

export interface CanvasProps extends React.HTMLAttributes<HTMLDivElement> {
	children?: React.ReactNode;
	margin?: number;
	onRender?: (svg: string) => void;
	title?: string;
}

// Component to render a single SVG element with event handlers
function SvgElementRenderer({ element }: { element: SvgElement }) {
	const handlers = element.id ? getEventHandlers(element.id) : undefined;

	if (element.type === "circle") {
		return (
			<circle
				id={element.id}
				cx={element.cx}
				cy={element.cy}
				r={element.r}
				fill={element.fill}
				stroke={element.stroke}
				strokeWidth={element.strokeWidth}
				{...handlers}
			/>
		);
	}

	if (element.type === "rect") {
		return (
			<rect
				id={element.id}
				x={element.x}
				y={element.y}
				width={element.width}
				height={element.height}
				fill={element.fill}
				stroke={element.stroke}
				strokeWidth={element.strokeWidth}
				{...handlers}
			/>
		);
	}

	if (element.type === "text") {
		return (
			<text
				id={element.id}
				x={element.x}
				y={element.y}
				fill={element.fill}
				stroke={element.stroke}
				strokeWidth={element.strokeWidth}
				{...handlers}
			>
				{element.text}
			</text>
		);
	}

	if (element.type === "line") {
		return (
			<line
				id={element.id}
				x1={element.x1}
				y1={element.y1}
				x2={element.x2}
				y2={element.y2}
				stroke={element.stroke}
				strokeWidth={element.strokeWidth}
				{...handlers}
			/>
		);
	}

	if (element.type === "polygon") {
		return (
			<polygon
				id={element.id}
				points={element.points}
				fill={element.fill}
				stroke={element.stroke}
				strokeWidth={element.strokeWidth}
				{...handlers}
			/>
		);
	}

	return null;
}

// Helper to serialize AST to SVG string (for onRender callback)
function serializeAst(ast: SvgDocument): string {
	const elements = ast.children
		.map((el) => {
			if (el.type === "circle") {
				return `<circle id="${el.id}" cx="${el.cx}" cy="${el.cy}" r="${el.r}" fill="${el.fill ?? "none"}" stroke="${el.stroke ?? "none"}" stroke-width="${el.strokeWidth ?? 0}" />`;
			}
			if (el.type === "rect") {
				return `<rect id="${el.id}" x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" fill="${el.fill ?? "none"}" stroke="${el.stroke ?? "none"}" stroke-width="${el.strokeWidth ?? 0}" />`;
			}
			if (el.type === "text") {
				return `<text id="${el.id}" x="${el.x}" y="${el.y}" fill="${el.fill ?? "black"}">${el.text}</text>`;
			}
			if (el.type === "line") {
				return `<line id="${el.id}" x1="${el.x1}" y1="${el.y1}" x2="${el.x2}" y2="${el.y2}" stroke="${el.stroke ?? "black"}" stroke-width="${el.strokeWidth ?? 1}" />`;
			}
			if (el.type === "polygon") {
				return `<polygon points="${el.points}" fill="${el.fill ?? "none"}" stroke="${el.stroke ?? "black"}" stroke-width="${el.strokeWidth ?? 1}" />`;
			}
			return "";
		})
		.join("\n");

	return `<svg width="${ast.width}" height="${ast.height}" xmlns="http://www.w3.org/2000/svg">\n${elements}\n</svg>`;
}

export function Canvas({
	children,
	margin = 0,
	onRender,
	title,
	...props
}: CanvasProps) {
	const rootRef = React.useRef<ReconcilerRoot | null>(null);
	const [ast, setAst] = React.useState<SvgDocument | null>(null);

	React.useEffect(() => {
		if (!rootRef.current) {
			rootRef.current = createRoot();
		}

		async function render() {
			if (!rootRef.current) return;

			// TODO: Add context bridging with its-fine
			// For now, render children directly without context bridge
			await rootRef.current.render(children);
			const scene = rootRef.current.getScene();

			// Only render if we have nodes
			if (scene.nodes.length > 0) {
				const layout = solveLayout(scene);
				const svgAst = layoutToAst(layout, scene.nodes, margin);
				setAst(svgAst);

				// Call onRender with serialized SVG if callback provided
				if (onRender) {
					const svgString = serializeAst(svgAst);
					onRender(svgString);
				}
			} else {
				setAst(null);
			}
		}

		render();
	}, [children, margin, onRender]);

	// Cleanup on unmount
	React.useEffect(() => {
		return () => {
			if (rootRef.current) {
				rootRef.current.unmount();
			}
		};
	}, []);

	if (!ast) {
		return <div {...props} />;
	}

	return (
		<div {...props}>
			<svg
				width={ast.width}
				height={ast.height}
				xmlns="http://www.w3.org/2000/svg"
				role="img"
				aria-label={title || "Modular SVG diagram"}
			>
				{title && <title>{title}</title>}
				{ast.children.map((element, index) => (
					<SvgElementRenderer
						key={element.id ?? `element-${index}`}
						element={element}
					/>
				))}
			</svg>
		</div>
	);
}
