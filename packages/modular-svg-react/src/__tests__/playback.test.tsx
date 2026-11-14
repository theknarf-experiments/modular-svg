import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Graphic } from "../Graphic";

type Fake = {
	playState: string;
	currentTime: number | null;
	ready: Promise<unknown>;
	effect: { target: Element } | null;
	play: ReturnType<typeof vi.fn>;
	pause: ReturnType<typeof vi.fn>;
};

// jsdom has no animations: stand in one CSS animation per graphic
const proto = SVGSVGElement.prototype as unknown as Record<string, unknown>;
const STUBS = [
	"getAnimations",
	"pauseAnimations",
	"unpauseAnimations",
	"setCurrentTime",
	"getCurrentTime",
];
let animation: Fake;
let smil: { paused: boolean; time: number };

beforeEach(() => {
	smil = { paused: false, time: 0.07 };
	animation = {
		playState: "running",
		currentTime: 0,
		ready: Promise.resolve(),
		effect: null,
		play: vi.fn(() => {
			animation.playState = "running";
		}),
		pause: vi.fn(() => {
			animation.playState = "paused";
		}),
	};
	proto.getAnimations = () => [animation];
	proto.pauseAnimations = () => {
		smil.paused = true;
	};
	proto.unpauseAnimations = () => {
		smil.paused = false;
	};
	proto.setCurrentTime = (t: number) => {
		smil.time = t;
	};
	proto.getCurrentTime = () => smil.time;
});
afterEach(() => {
	for (const name of STUBS) delete proto[name];
	vi.restoreAllMocks();
});

const scene = (
	props: { playhead?: number; transition?: boolean; spacing?: number } = {},
) => (
	<Graphic
		playhead={props.playhead}
		transition={props.transition}
		animation={{ loop: true }}
	>
		<stackH spacing={props.spacing ?? 10}>
			<circle key="a" r={5} />
			<circle key="b" r={5} />
		</stackH>
		<enter key="in" over={1}>
			<ref target="a" />
		</enter>
	</Graphic>
);
const mounted = async (container: HTMLElement) => {
	await waitFor(() => expect(container.querySelector("circle#b")).toBeTruthy());
	await new Promise((r) => setTimeout(r, 0));
};

describe("Graphic playback", () => {
	it("leaves an animation the stylesheet holds still alone on mount", async () => {
		animation.playState = "paused";
		const { container } = render(scene());
		await mounted(container);
		expect(animation.play).not.toHaveBeenCalled();
		expect(animation.playState).toBe("paused");
	});

	it("returns to the stylesheet's still frame when a scrub lets go under reduced motion", async () => {
		animation.playState = "paused";
		vi.spyOn(window, "getComputedStyle").mockReturnValue({
			animationPlayState: "paused",
		} as CSSStyleDeclaration);
		const { container, rerender } = render(scene({ playhead: 0.5 }));
		await mounted(container);
		animation.effect = { target: container.querySelector("svg") as Element };
		expect(animation.currentTime).toBe(500);
		rerender(scene());
		await mounted(container);
		expect(animation.play).not.toHaveBeenCalled();
		expect(animation.currentTime).toBe(0);
	});

	it("plays on once a scrub lets go", async () => {
		const { container, rerender } = render(scene({ playhead: 0.5 }));
		await mounted(container);
		expect(animation.playState).toBe("paused");
		expect(smil).toEqual({ paused: true, time: 0.5 });
		rerender(scene());
		await mounted(container);
		expect(animation.play).toHaveBeenCalledTimes(1);
		expect(smil.paused).toBe(false);
	});

	it("puts the SMIL clock on the CSS one once the animations have started", async () => {
		animation.currentTime = 12;
		const { container } = render(scene());
		await mounted(container);
		expect(smil.time).toBeCloseTo(0.012, 6);
	});
});

describe("Graphic transition while held", () => {
	it("applies a change without tweens, which a paused timeline would freeze", async () => {
		const { container, rerender } = render(
			scene({ playhead: 0.5, transition: true }),
		);
		await mounted(container);
		const before = container.querySelector("circle#b")?.getAttribute("cx");
		rerender(scene({ playhead: 0.5, transition: true, spacing: 40 }));
		await waitFor(() =>
			expect(container.querySelector("circle#b")?.getAttribute("cx")).not.toBe(
				before,
			),
		);
		expect(container.querySelector("[data-transition]")).toBeNull();
	});

	it("drops running tweens when a playhead takes hold", async () => {
		const { container, rerender } = render(scene({ transition: true }));
		await mounted(container);
		rerender(scene({ transition: true, spacing: 40 }));
		await waitFor(() =>
			expect(container.querySelector("[data-transition]")).toBeTruthy(),
		);
		rerender(scene({ transition: true, spacing: 40, playhead: 0.5 }));
		await waitFor(() =>
			expect(container.querySelector("[data-transition]")).toBeNull(),
		);
	});
});
