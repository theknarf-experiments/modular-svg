import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { cuesBetween, type Solution } from "../cues";
import { Graphic } from "../Graphic";

const solution = (loop: boolean) => ({
	spans: { a: { start: 0.5, duration: 1 }, b: { start: 2, duration: 0.5 } },
	duration: 3,
	loop,
});

describe("cuesBetween", () => {
	it("finds starts and ends passed since the last frame", () => {
		const cues = cuesBetween(solution(false), ["a", "a:end", "b"], 0.4, 2);
		expect(cues.map((c) => [c.id, c.edge, c.at])).toEqual([
			["a", "start", 0.5],
			["a", "end", 1.5],
			["b", "start", 2],
		]);
	});

	it("repeats cues on every pass of a loop", () => {
		const cues = cuesBetween(solution(true), ["a"], 2.9, 6.6);
		expect(cues.map((c) => c.at)).toEqual([3.5, 6.5]);
	});

	it("fires nothing when scrubbed backwards or for unknown ids", () => {
		expect(cuesBetween(solution(true), ["a"], 2, 0.1)).toEqual([]);
		expect(cuesBetween(solution(false), ["nope"], 0, 10)).toEqual([]);
	});
});

describe("onSolve", () => {
	it("hands out solved spans, warnings and a clock", async () => {
		let solved: Solution | undefined;
		render(
			<Graphic animation={{ loop: true }} onSolve={(s) => (solved = s)}>
				<circle key="a" r={5} />
				<enter key="aIn" over={0.5}>
					<ref target="a" />
				</enter>
				<sequence gap={0.25}>
					<ref target="aIn" />
				</sequence>
			</Graphic>,
		);
		await waitFor(() => expect(solved).toBeDefined());
		expect(solved?.spans.aIn).toEqual({ start: 0, duration: 0.5 });
		expect(solved?.duration).toBe(0.5);
		expect(solved?.loop).toBe(true);
		expect(solved?.boxes.a.width).toBe(10);
		expect(solved?.warnings).toEqual([]);
		// jsdom runs no animations, so the clock has nothing to read
		expect(() => solved?.time()).not.toThrow();
	});
});

describe("onSolve feeding parent state", () => {
	it("settles instead of re-solving forever", async () => {
		const { useState } = await import("react");
		let calls = 0;
		function Parent() {
			const [, setSolution] = useState<Solution>();
			return (
				<Graphic
					onSolve={(s) => {
						calls++;
						setSolution(s);
					}}
				>
					<circle key="a" r={5} />
				</Graphic>
			);
		}
		render(<Parent />);
		await waitFor(() => expect(calls).toBe(1));
		await new Promise((r) => setTimeout(r, 100));
		expect(calls).toBe(1);
	});
});
