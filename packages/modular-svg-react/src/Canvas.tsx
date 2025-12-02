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

export function Canvas({ children, margin = 0, title, ...props }: CanvasProps) {
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
			} else {
				setAst(null);
			}
		}

		render();
	}, [children, margin]);

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
