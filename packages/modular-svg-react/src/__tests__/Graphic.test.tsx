import { render, waitFor } from "@testing-library/react";
import * as React from "react";
import { describe, expect, it } from "vitest";
import { Graphic } from "../Graphic";

// Extend JSX intrinsic elements for testing
// Using module augmentation to extend, not replace React's types

describe("Graphic component", () => {
	describe("Basic Rendering", () => {
		it("should render Graphic component", async () => {
			const { container } = render(
				<Graphic>
					<circle r={10} />
				</Graphic>,
			);

			// Should create a div container
			expect(container.firstChild).toBeTruthy();
			expect(container.firstChild?.nodeName).toBe("DIV");
		});

		it("should render SVG inside Graphic", async () => {
			const { container } = render(
				<Graphic>
					<circle r={10} fill="red" />
				</Graphic>,
			);

			await waitFor(() => {
				const svg = container.querySelector("svg");
				expect(svg).toBeTruthy();
			});
		});

		it("should render circle element in SVG", async () => {
			const { container } = render(
				<Graphic>
					<circle r={10} fill="red" />
				</Graphic>,
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
				<Graphic>
					<stackH spacing={10}>
						<circle r={5} fill="red" />
						<circle r={8} fill="blue" />
					</stackH>
				</Graphic>,
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
				<Graphic margin={20}>
					<circle r={10} />
				</Graphic>,
			);

			await waitFor(() => {
				const svg = container.querySelector("svg");
				expect(svg).toBeTruthy();
			});
		});

		it("should accept className prop", () => {
			const { container } = render(
				<Graphic className="my-canvas">
					<circle r={10} />
				</Graphic>,
			);

			const div = container.firstChild as HTMLElement;
			expect(div.className).toContain("my-canvas");
		});

		it("should accept style prop", () => {
			const { container } = render(
				<Graphic style={{ width: "500px", height: "300px" }}>
					<circle r={10} />
				</Graphic>,
			);

			const div = container.firstChild as HTMLElement;
			expect(div.style.width).toBe("500px");
			expect(div.style.height).toBe("300px");
		});
	});

	describe("Context Forwarding", () => {
		it("should forward React context to children", async () => {
			const ThemeContext = React.createContext("light");
			let receivedTheme: string | undefined;

			function ThemedCircle() {
				receivedTheme = React.useContext(ThemeContext);
				return <circle r={10} />;
			}

			render(
				<ThemeContext.Provider value="dark">
					<Graphic>
						<ThemedCircle />
					</Graphic>
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
						<Graphic>
							<Component />
						</Graphic>
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
						<Graphic>
							<DynamicCircle />
						</Graphic>
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
					<Graphic>
						<circle r={radius} />
					</Graphic>
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
					<Graphic>
						<circle r={10} fill={fill} />
					</Graphic>
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
				<Graphic>
					<circle r={10} />
				</Graphic>,
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
				<Graphic margin={10}>
					<stackV spacing={15}>
						<stackH spacing={10}>
							<circle r={15} fill="red" />
							<circle r={15} fill="blue" />
						</stackH>
						<circle r={10} fill="green" />
					</stackV>
				</Graphic>,
			);

			await waitFor(() => {
				const circles = container.querySelectorAll("circle");
				expect(circles.length).toBe(3);
			});
		});

		it("should handle React components inside Graphic", async () => {
			function CustomShape({ color }: { color: string }) {
				return <circle r={10} fill={color} />;
			}

			const { container } = render(
				<Graphic>
					<stackH>
						<CustomShape color="red" />
						<CustomShape color="blue" />
					</stackH>
				</Graphic>,
			);

			await waitFor(() => {
				const circles = container.querySelectorAll("circle");
				expect(circles.length).toBe(2);
			});
		});
	});

	describe("Arrow rendering", () => {
		it("renders arrows as a straight line with a polygon head", async () => {
			const { container } = render(
				<Graphic>
					<rect key="a" width={40} height={30} />
					<rect key="b" x={120} y={90} width={40} height={30} />
					<arrow key="arr">
						<ref target="a" />
						<ref target="b" />
					</arrow>
				</Graphic>,
			);

			await waitFor(() => {
				const line = container.querySelector("line");
				expect(line).toBeTruthy();
				const polygon = container.querySelector("polygon");
				expect(polygon).toBeTruthy();
			});
		});
	});

	describe("Full planet feature set (text, background, align, distribute, ref, arrow)", () => {
		it("renders every relation from the original JSON example via JSX", async () => {
			const { container } = render(
				<Graphic>
					<background key="bg" padding={20}>
						<stackH spacing={50}>
							<circle key="mercury" r={15} />
							<circle key="venus" r={36} />
						</stackH>
					</background>
					<text key="label">Mercury</text>
					<align key="al" axis="x" alignment="center">
						<ref target="label" />
						<ref target="mercury" />
					</align>
					<distribute key="di" axis="y" spacing={60}>
						<ref target="label" />
						<ref target="mercury" />
					</distribute>
					<arrow key="arr">
						<ref target="label" />
						<ref target="mercury" />
					</arrow>
				</Graphic>,
			);

			await waitFor(() => {
				// text label
				const label = container.querySelector("text");
				expect(label?.textContent).toBe("Mercury");
				// background frame rect
				expect(container.querySelector('rect[id="bg"]')).toBeTruthy();
				// arrow line + head
				expect(container.querySelector("line")).toBeTruthy();
				expect(container.querySelector("polygon")).toBeTruthy();

				// align: label centered over mercury ("Mercury" = 7 chars * 8px)
				const mercury = container.querySelector('circle[id="mercury"]');
				const labelCenterX = Number(label?.getAttribute("x")) + (7 * 8) / 2;
				const cx = Number(mercury?.getAttribute("cx"));
				expect(labelCenterX).toBeCloseTo(cx, 2);

				// distribute: 60px between label bottom (16px tall) and mercury top
				const labelBottom = Number(label?.getAttribute("y")) + 16;
				const mercuryTop = Number(mercury?.getAttribute("cy")) - 15;
				expect(mercuryTop - labelBottom).toBeCloseTo(60, 2);
			});
		});
	});
});
