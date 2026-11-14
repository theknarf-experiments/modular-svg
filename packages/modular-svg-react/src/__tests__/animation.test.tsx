import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Solution } from "../cues";
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

	it("plays a component's timeline as a phrase: there and back, with its spans in scene time", async () => {
		const Reveal = () => (
			<>
				<circle key="a" r={10} />
				<enter key="aIn" over={1} ease="linear">
					<ref target="a" />
				</enter>
			</>
		);
		const solved: Solution[] = [];
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const { container } = render(
			<Graphic onSolve={(s) => solved.push(s)}>
				<Reveal />
				<phrase key="thereAndBack" repeat={2} alternate at={1}>
					<ref target="aIn" />
				</phrase>
			</Graphic>,
		);
		await waitFor(() => expect(container.querySelector("style")).toBeTruthy());
		const css = container.querySelector("style")?.textContent ?? "";
		expect(css).toContain("animation-duration:3s");
		expect(css).toMatch(
			/33\.333%\{opacity:0;[^}]+\}66\.667%\{opacity:1;[^}]+\}100%\{opacity:0\}/,
		);
		expect(solved.at(-1)?.spans.thereAndBack).toEqual({
			start: 1,
			duration: 2,
		});
		expect(solved.at(-1)?.spans.aIn).toEqual({ start: 1, duration: 1 });
		expect(solved.at(-1)?.warnings).toEqual([]);
		expect(warn).not.toHaveBeenCalled();
		warn.mockRestore();
	});

	it("moves a modulated mark and redraws the arrow attached to it", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const { container } = render(
			<Graphic>
				<stackH key="row" spacing={30}>
					<rect key="a" width={20} height={20} />
					<rect key="b" width={20} height={20} />
				</stackH>
				<rect key="job" width={8} height={8} y={60} />
				<align alignment="centerX">
					<ref target="a" />
					<ref target="job" />
				</align>
				<arrow key="wire">
					<ref target="a" />
					<ref target="job" />
				</arrow>
				<modulate key="hop" over={1}>
					<align alignment="centerX">
						<ref target="b" />
						<ref target="job" />
					</align>
				</modulate>
			</Graphic>,
		);
		await waitFor(() => expect(container.querySelector("style")).toBeTruthy());
		expect(container.querySelector("#job")?.parentElement?.tagName).toBe("g");
		expect(
			container
				.querySelector("path#wire animate")
				?.getAttribute("attributeName"),
		).toBe("d");
		expect(container.querySelector("path#wire-head animate")).toBeTruthy();
		expect(container.querySelector("line#wire")).toBeNull();
		expect(warn).not.toHaveBeenCalled();
		warn.mockRestore();
	});
});
