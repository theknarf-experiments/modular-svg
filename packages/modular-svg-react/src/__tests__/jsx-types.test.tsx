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
			</Graphic>
		);
		const wrong = (
			<Graphic>
				{/* @ts-expect-error gap is a number */}
				<sequence gap="soon" />
				{/* @ts-expect-error not an ease */}
				<enter ease="wobbly" />
				{/* @ts-expect-error align is start or end */}
				<onBeat align="middle" />
			</Graphic>
		);
		expect([ok, wrong]).toHaveLength(2);
	});
});
