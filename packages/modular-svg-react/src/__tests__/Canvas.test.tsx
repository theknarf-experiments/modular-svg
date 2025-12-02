import { render, waitFor } from "@testing-library/react";
import * as React from "react";
import { describe, expect, it } from "vitest";
import { Canvas } from "../Canvas";

// Extend JSX intrinsic elements for testing
// Using module augmentation to extend, not replace React's types
declare module "react" {
	namespace JSX {
		interface IntrinsicElements {
			stackH: { spacing?: number; children?: React.ReactNode };
			stackV: { spacing?: number; children?: React.ReactNode };
		}
	}
}

describe("Canvas component", () => {
	describe("Basic Rendering", () => {
		it("should render Canvas component", async () => {
			const { container } = render(
				<Canvas>
					<circle r={10} />
				</Canvas>,
			);

			// Should create a div container
			expect(container.firstChild).toBeTruthy();
			expect(container.firstChild?.nodeName).toBe("DIV");
		});

		it("should render SVG inside Canvas", async () => {
			const { container } = render(
				<Canvas>
					<circle r={10} fill="red" />
				</Canvas>,
			);

			await waitFor(() => {
				const svg = container.querySelector("svg");
				expect(svg).toBeTruthy();
			});
		});

		it("should render circle element in SVG", async () => {
			const { container } = render(
				<Canvas>
					<circle r={10} fill="red" />
				</Canvas>,
			);

			await waitFor(() => {
				const circle = container.querySelector("circle");
				expect(circle).toBeTruthy();
				expect(circle?.getAttribute("r")).toBe("10");
				expect(circle?.getAttribute("fill")).toBe("red");
			});
		});

		it("should render multiple elements", async () => {
			const { container } = render(
				<Canvas>
					<stackH spacing={10}>
						<circle r={5} fill="red" />
						<circle r={8} fill="blue" />
					</stackH>
				</Canvas>,
			);

			await waitFor(() => {
				const circles = container.querySelectorAll("circle");
				expect(circles.length).toBeGreaterThanOrEqual(2);
			});
		});
	});

	describe("Props", () => {
		it("should accept margin prop", async () => {
			const { container } = render(
				<Canvas margin={20}>
					<circle r={10} />
				</Canvas>,
			);

			await waitFor(() => {
				const svg = container.querySelector("svg");
				expect(svg).toBeTruthy();
			});
		});

		it("should accept className prop", () => {
			const { container } = render(
				<Canvas className="my-canvas">
					<circle r={10} />
				</Canvas>,
			);

			const div = container.firstChild as HTMLElement;
			expect(div.className).toContain("my-canvas");
		});

		it("should accept style prop", () => {
			const { container } = render(
				<Canvas style={{ width: "500px", height: "300px" }}>
					<circle r={10} />
				</Canvas>,
			);

			const div = container.firstChild as HTMLElement;
			expect(div.style.width).toBe("500px");
			expect(div.style.height).toBe("300px");
		});
	});

	// TODO: Context forwarding with its-fine
	// Issue: useContextMap() returns empty map when called from CanvasImpl inside FiberProvider
	// Need to investigate why its-fine can't traverse fiber tree to find parent contexts
	// Possible solutions:
	// 1. Different FiberProvider placement
	// 2. Manual context forwarding without its-fine
	// 3. Users explicitly pass context bridge
	describe.skip("Context Forwarding", () => {
		it("should forward React context to children", async () => {
			const ThemeContext = React.createContext("light");
			let receivedTheme: string | undefined;

			function ThemedCircle() {
				receivedTheme = React.useContext(ThemeContext);
				return <circle r={10} />;
			}

			render(
				<ThemeContext.Provider value="dark">
					<Canvas>
						<ThemedCircle />
					</Canvas>
				</ThemeContext.Provider>,
			);

			await waitFor(() => {
				expect(receivedTheme).toBe("dark");
			});
		});

		it("should forward multiple contexts", async () => {
			const ThemeContext = React.createContext("light");
			const SizeContext = React.createContext(10);

			let receivedTheme: string | undefined;
			let receivedSize: number | undefined;

			function Component() {
				receivedTheme = React.useContext(ThemeContext);
				receivedSize = React.useContext(SizeContext);
				return <circle r={receivedSize} />;
			}

			render(
				<ThemeContext.Provider value="dark">
					<SizeContext.Provider value={20}>
						<Canvas>
							<Component />
						</Canvas>
					</SizeContext.Provider>
				</ThemeContext.Provider>,
			);

			await waitFor(() => {
				expect(receivedTheme).toBe("dark");
				expect(receivedSize).toBe(20);
			});
		});

		it("should update when context changes", async () => {
			const SizeContext = React.createContext(10);

			function DynamicCircle() {
				const size = React.useContext(SizeContext);
				return <circle r={size} />;
			}

			function App({ size }: { size: number }) {
				return (
					<SizeContext.Provider value={size}>
						<Canvas>
							<DynamicCircle />
						</Canvas>
					</SizeContext.Provider>
				);
			}

			const { rerender, container } = render(<App size={10} />);

			await waitFor(() => {
				const circle = container.querySelector("circle");
				expect(circle?.getAttribute("r")).toBe("10");
			});

			rerender(<App size={20} />);

			await waitFor(() => {
				const circle = container.querySelector("circle");
				expect(circle?.getAttribute("r")).toBe("20");
			});
		});
	});

	describe("Updates", () => {
		it("should re-render when children change", async () => {
			function App({ radius }: { radius: number }) {
				return (
					<Canvas>
						<circle r={radius} />
					</Canvas>
				);
			}

			const { rerender, container } = render(<App radius={10} />);

			await waitFor(() => {
				const circle = container.querySelector("circle");
				expect(circle?.getAttribute("r")).toBe("10");
			});

			rerender(<App radius={20} />);

			await waitFor(() => {
				const circle = container.querySelector("circle");
				expect(circle?.getAttribute("r")).toBe("20");
			});
		});

		it("should update SVG when props change", async () => {
			function App({ fill }: { fill: string }) {
				return (
					<Canvas>
						<circle r={10} fill={fill} />
					</Canvas>
				);
			}

			const { rerender, container } = render(<App fill="red" />);

			await waitFor(() => {
				const circle = container.querySelector("circle");
				expect(circle?.getAttribute("fill")).toBe("red");
			});

			rerender(<App fill="blue" />);

			await waitFor(() => {
				const circle = container.querySelector("circle");
				expect(circle?.getAttribute("fill")).toBe("blue");
			});
		});
	});

	describe("Cleanup", () => {
		it("should cleanup on unmount", async () => {
			const { container, unmount } = render(
				<Canvas>
					<circle r={10} />
				</Canvas>,
			);

			await waitFor(() => {
				expect(container.querySelector("svg")).toBeTruthy();
			});

			unmount();

			// Container should be empty after unmount
			expect(container.firstChild).toBeFalsy();
		});
	});

	describe("Complex Scenes", () => {
		it("should render complex nested layout", async () => {
			const { container } = render(
				<Canvas margin={10}>
					<stackV spacing={15}>
						<stackH spacing={10}>
							<circle r={15} fill="red" />
							<circle r={15} fill="blue" />
						</stackH>
						<circle r={10} fill="green" />
					</stackV>
				</Canvas>,
			);

			await waitFor(() => {
				const circles = container.querySelectorAll("circle");
				expect(circles.length).toBe(3);
			});
		});

		it("should handle React components inside Canvas", async () => {
			function CustomShape({ color }: { color: string }) {
				return <circle r={10} fill={color} />;
			}

			const { container } = render(
				<Canvas>
					<stackH>
						<CustomShape color="red" />
						<CustomShape color="blue" />
					</stackH>
				</Canvas>,
			);

			await waitFor(() => {
				const circles = container.querySelectorAll("circle");
				expect(circles.length).toBe(2);
			});
		});
	});
});
