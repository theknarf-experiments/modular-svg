import { solveLayout } from "@modular-svg/core";
import { render } from "@testing-library/react";
import { createElement, useState } from "react";
import { describe, expect, it } from "vitest";
import { renderScene } from "../reconciler";

describe("renderScene", () => {
	it("turns JSX into a scene synchronously", () => {
		const scene = renderScene(
			<stackH spacing={10}>
				<rect key="a" width={20} height={20} />
				<rect key="b" width={30} height={20} />
			</stackH>,
		);
		const layout = solveLayout(scene);
		expect(layout.b.x - layout.a.x).toBeCloseTo(30);
	});

	it("renders components, hooks included", () => {
		const Box = ({ id }: { id: string }) => {
			const [width] = useState(40);
			return <rect key={id} width={width} height={10} />;
		};
		const layout = solveLayout(renderScene(createElement(Box, { id: "x" })));
		expect(layout.x.width).toBe(40);
	});

	it("gives unkeyed nodes the same ids on every render", () => {
		const ids = () =>
			renderScene(
				<stackV>
					<rect width={10} height={10} />
					<rect width={10} height={10} />
				</stackV>,
			).nodes.map((n) => n.id);
		expect(ids()).toEqual(ids());
	});

	it("renders inside a react-dom render, as Dragology calls it", () => {
		const Outer = () => {
			const scene = renderScene(<rect key="inner" width={5} height={5} />);
			return <span>{scene.nodes.map((n) => n.id).join()}</span>;
		};
		const { container } = render(<Outer />);
		expect(container.textContent).toBe("inner");
	});
});
