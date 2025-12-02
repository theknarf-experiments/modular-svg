import { layoutToSvg, solveLayout } from "@modular-svg/core";
import * as React from "react";
import { createRoot, type ReconcilerRoot } from "./reconciler";

export interface CanvasProps extends React.HTMLAttributes<HTMLDivElement> {
	children?: React.ReactNode;
	margin?: number;
	onRender?: (svg: string) => void;
}

export function Canvas({
	children,
	margin = 0,
	onRender,
	...props
}: CanvasProps) {
	const rootRef = React.useRef<ReconcilerRoot | null>(null);
	const [svg, setSvg] = React.useState<string>("");

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
				const svgString = layoutToSvg(layout, scene.nodes, margin);
				setSvg(svgString);
				onRender?.(svgString);
			} else {
				setSvg("");
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

	return <div {...props} dangerouslySetInnerHTML={{ __html: svg }} />;
}
