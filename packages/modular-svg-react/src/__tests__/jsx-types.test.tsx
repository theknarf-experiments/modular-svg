import { describe, expect, it } from "vitest";
import { Graphic } from "../index";

// Compile-time checks: `pnpm typecheck` fails if the shipped JSX types stop
// applying (each @ts-expect-error must still be an error)
describe("shipped JSX types", () => {
	it("type the time language", () => {
		const ok = (
			<Graphic>
				<enter key="in" over={0.5} from={{ opacity: 0 }} ease="pop">
					<ref target="a" />
				</enter>
				<onBeat align="end" division={3} swing={2 / 3}>
					<ref target="beat" />
				</onBeat>
				<motion key="m" steps={[{ to: { fill: { ref: "a" } }, over: 1 }]}>
					<ref target="a" />
				</motion>
				<phrase key="p" at={1} over={4} repeat={2} alternate retrograde>
					<ref target="in" />
				</phrase>
				<phrase rate={2} repeat>
					<ref target="m" />
				</phrase>
				<modulate key="shuffle" at={1} over={0.4} ease="inOut">
					<stackV spacing={8}>
						<ref target="a" />
					</stackV>
				</modulate>
				<resolve key="home" at={2} ease="out">
					<ref target="shuffle" />
				</resolve>
			</Graphic>
		);
		const wrong = (
			<Graphic>
				{/* @ts-expect-error gap is a number */}
				<sequence gap="soon" />
				{/* @ts-expect-error not an ease */}
				<enter ease="wobbly" />
				{/* @ts-expect-error repeat is a count or a boolean */}
				<phrase repeat="twice" />
				{/* @ts-expect-error not an ease */}
				<modulate ease="wobbly" />
				{/* @ts-expect-error over is a number */}
				<resolve over="slowly" />
				{/* @ts-expect-error align is start or end */}
				<onBeat align="middle" />
			</Graphic>
		);
		expect([ok, wrong]).toHaveLength(2);
	});
});
