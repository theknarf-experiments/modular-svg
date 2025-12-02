import { act } from "@testing-library/react";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRoot, type ReconcilerRoot } from "../reconciler";

// Extend JSX intrinsic elements for testing
declare module "react" {
	namespace JSX {
		interface IntrinsicElements {
			stackH: { spacing?: number; children?: React.ReactNode };
			stackV: { spacing?: number; children?: React.ReactNode };
		}
	}
}

describe("modular-svg reconciler", () => {
	let root: ReconcilerRoot;

	beforeEach(() => {
		root = createRoot();
	});

	afterEach(async () => {
		await act(async () => {
			await root.unmount();
		});
	});

	describe("Basic Element Creation", () => {
		it("should create a circle element", async () => {
			await act(async () => {
				await root.render(<circle r={10} fill="red" />);
			});

			const scene = root.getScene();
			expect(scene.nodes).toHaveLength(1);
			expect(scene.nodes[0].type).toBe("circle");
			expect(scene.nodes[0].r).toBe(10);
			expect(scene.nodes[0].fill).toBe("red");
		});

		it("should create a rect element", async () => {
			await act(async () => {
				await root.render(<rect width={20} height={30} fill="blue" />);
			});

			const scene = root.getScene();
			expect(scene.nodes).toHaveLength(1);
			expect(scene.nodes[0].type).toBe("rect");
			expect(scene.nodes[0].width).toBe(20);
			expect(scene.nodes[0].height).toBe(30);
		});
	});

	describe("Element Hierarchy", () => {
		it("should create parent-child relationships", async () => {
			await act(async () => {
				await root.render(
					<stackH spacing={10}>
						<circle r={5} />
						<circle r={8} />
					</stackH>,
				);
			});

			const scene = root.getScene();
			expect(scene.nodes).toHaveLength(3); // stackH container + 2 circles
			// stackH is a layout container, so it doesn't have a type (only visual elements do)
			expect(scene.nodes[0].id).toBeDefined();
		});

		it("should handle nested hierarchy", async () => {
			await act(async () => {
				await root.render(
					<stackV spacing={5}>
						<stackH spacing={10}>
							<circle r={5} />
							<circle r={8} />
						</stackH>
						<circle r={12} />
					</stackV>,
				);
			});

			const scene = root.getScene();
			// stackV + stackH + 3 circles = 5 nodes
			expect(scene.nodes).toHaveLength(5);
		});
	});

	describe("Props Updates", () => {
		it("should update props on re-render", async () => {
			await act(async () => {
				await root.render(<circle r={10} fill="red" />);
			});

			await act(async () => {
				await root.render(<circle r={20} fill="blue" />);
			});

			const scene = root.getScene();
			expect(scene.nodes).toHaveLength(1);
			expect(scene.nodes[0].r).toBe(20);
			expect(scene.nodes[0].fill).toBe("blue");
		});

		it("should handle partial props updates", async () => {
			await act(async () => {
				await root.render(<circle r={10} fill="red" />);
			});

			await act(async () => {
				await root.render(<circle r={10} fill="blue" />);
			});

			const scene = root.getScene();
			expect(scene.nodes[0].r).toBe(10); // unchanged
			expect(scene.nodes[0].fill).toBe("blue"); // changed
		});
	});

	describe("Element Removal", () => {
		it("should remove elements on unmount", async () => {
			await act(async () => {
				await root.render(
					<stackH>
						<circle r={5} />
						<circle r={8} />
					</stackH>,
				);
			});

			await act(async () => {
				await root.render(
					<stackH>
						<circle r={5} />
					</stackH>,
				);
			});

			const scene = root.getScene();
			expect(scene.nodes).toHaveLength(2); // stackH + 1 circle
		});

		it("should handle complete unmount", async () => {
			await act(async () => {
				await root.render(<circle r={10} />);
			});

			await act(async () => {
				await root.render(null);
			});

			const scene = root.getScene();
			expect(scene.nodes).toHaveLength(0);
		});
	});

	describe("Key/ID Stability", () => {
		it("should use key prop for stable IDs", async () => {
			await act(async () => {
				await root.render(<circle key="my-circle" r={10} />);
			});

			const scene = root.getScene();
			expect(scene.nodes[0].id).toBe("my-circle");
		});

		it("should generate deterministic IDs without key", async () => {
			await act(async () => {
				await root.render(<circle r={10} />);
			});

			const scene1 = root.getScene();
			const id1 = scene1.nodes[0].id;

			await act(async () => {
				await root.render(null);
			});

			await act(async () => {
				await root.render(<circle r={10} />);
			});

			const scene2 = root.getScene();
			const id2 = scene2.nodes[0].id;

			// Same structure should produce same ID
			expect(id1).toBe(id2);
		});
	});

	describe("React Components", () => {
		it("should render React components", async () => {
			function MyCircles() {
				return (
					<>
						<circle r={5} />
						<circle r={8} />
					</>
				);
			}

			await act(async () => {
				await root.render(<MyCircles />);
			});

			const scene = root.getScene();
			// Fragment with multiple children gets wrapped in a Group
			expect(scene.nodes).toHaveLength(3); // Group + 2 circles
			const circles = scene.nodes.filter((n) => n.type === "circle");
			expect(circles).toHaveLength(2);
		});

		it("should render nested components", async () => {
			function Circle({ r }: { r: number }) {
				return <circle r={r} />;
			}

			function Stack() {
				return (
					<stackH>
						<Circle r={5} />
						<Circle r={10} />
					</stackH>
				);
			}

			await act(async () => {
				await root.render(<Stack />);
			});

			const scene = root.getScene();
			expect(scene.nodes).toHaveLength(3); // stackH + 2 circles
		});
	});

	describe("React Hooks Support", () => {
		it("should support useState", async () => {
			function DynamicCircle() {
				const [r, setR] = React.useState(10);

				React.useEffect(() => {
					setR(20);
				}, []);

				return <circle r={r} />;
			}

			await act(async () => {
				await root.render(<DynamicCircle />);
			});

			const scene = root.getScene();
			expect(scene.nodes[0].r).toBe(20);
		});

		it("should support useEffect", async () => {
			let effectRan = false;

			function EffectCircle() {
				React.useEffect(() => {
					effectRan = true;
				}, []);

				return <circle r={10} />;
			}

			await act(async () => {
				await root.render(<EffectCircle />);
			});

			expect(effectRan).toBe(true);
		});
	});
});
