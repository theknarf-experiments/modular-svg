import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Graphic } from "../Graphic";

describe("Graphic animation", () => {
	it("renders time relations from React nodes as styled, wrapped marks", async () => {
		const { container } = render(
			<Graphic>
				<stackH spacing={10}>
					<circle key="a" r={10} fill="red" />
					<circle key="b" r={10} fill="blue" />
				</stackH>
				<arrow key="arr">
					<ref target="a" />
					<ref target="b" />
				</arrow>
				<enter key="aIn" over={1}>
					<ref target="a" />
				</enter>
				<draw key="arrDraw" over={0.5}>
					<ref target="arr" />
				</draw>
				<enter key="bIn" over={1} from={{ scale: 0 }}>
					<ref target="b" />
				</enter>
				<sequence gap={0.25}>
					<ref target="aIn" />
					<ref target="arrDraw" />
					<ref target="bIn" />
				</sequence>
			</Graphic>,
		);

		await waitFor(() => expect(container.querySelector("style")).toBeTruthy());
		const css = container.querySelector("style")?.textContent ?? "";
		expect(css).toContain("animation-duration:3s");
		const a = container.querySelector("#a");
		expect(a?.parentElement?.tagName).toBe("g");
		expect(a?.parentElement?.getAttribute("class")).toMatch(
			/^ms\w+-a ms\w+-c\d$/,
		);
		const line = container.querySelector("line#arr");
		expect(line?.getAttribute("pathLength")).toBe("1");
		expect(line?.getAttribute("stroke-dasharray")).toBe("1");
	});

	it("passes functions through to Sampled and renders still when disabled", async () => {
		const { container } = render(
			<Graphic animation={false}>
				<circle key="dot" r={4} />
				<sampled
					key="orbit"
					over={2}
					fn={(t) => ({ x: 20 * Math.cos(t), y: 20 * Math.sin(t) })}
					tolerance={{ translate: 0.5 }}
				>
					<ref target="dot" />
				</sampled>
			</Graphic>,
		);
		await waitFor(() => expect(container.querySelector("circle")).toBeTruthy());
		expect(container.querySelector("style")).toBeNull();
	});
});
